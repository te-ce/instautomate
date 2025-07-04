import assert from "assert";
import { jsonDb, JsonDB } from "./db/db.ts";
import {
  shuffleArray,
  escapeXpathStr,
  sleep,
  getPageJson,
  getUserPageUrl,
} from "./util/util.ts";
import { Navigation } from "./actions/navigation.ts";
import { takeScreenshot } from "./actions/screenshot.ts";
import { BOT_WORK_SHIFT_HOURS, INSTAGRAM_URL } from "./util/const.ts";
import { Browser } from "puppeteer";
import { getOptions } from "./util/options.ts";
import { Media, User } from "./util/types.ts";
import { logger } from "./util/logger.ts";
import { throttle } from "./actions/limit.ts";
import { startup } from "./actions/startup.ts";
import { checkActionBlocked } from "./util/status.ts";

export const Instauto = async (db: JsonDB, browser: Browser) => {
  const options = await getOptions();
  const {
    username,
    maxFollowsPerHour,
    maxFollowsPerDay,
    followUserRatioMin,
    followUserRatioMax,
    followUserWithMaxFollowers,
    followUserWithMaxFollowing,
    followUserWithMinFollowers,
    followUserWithMinFollowing,
    followUserFilterFn,
    likeMediaFilterFn,
    dontUnfollowUntilTimeElapsed,
    excludeUsers,
    dryRun,
  } = options;
  const userDataCache: Record<string, User> = {};
  const page = await browser.newPage();
  const { gotoUrl, gotoWithRetry } = Navigation(page);
  const { addLikedPhoto, addPrevFollowedUser, addPrevUnfollowedUser } = db;

  assert(
    maxFollowsPerHour * BOT_WORK_SHIFT_HOURS >= maxFollowsPerDay,
    "Max follows per hour too low compared to max follows per day",
  );

  await startup(page, browser, options, db);

  const myUserId = await navigateToUserAndGetProfileId(username);

  async function onImageLiked({
    username,
    href,
  }: Pick<User, "username" | "href">) {
    await addLikedPhoto({ username, href, time: new Date().getTime() });
  }

  function haveRecentlyFollowedUser(username: string) {
    const followedUserEntry = db.prevFollowedUsers[username];
    if (!followedUserEntry) return false; // We did not previously follow this user, so don't know
    return (
      new Date().getTime() - followedUserEntry.time <
      dontUnfollowUntilTimeElapsed
    );
  }

  function isAlreadyOnUserPage(username: string) {
    const url = getUserPageUrl(username);
    // optimization: already on URL? (ignore trailing slash)
    return page.url().replace(/\/$/, "") === url.replace(/\/$/, "");
  }

  async function navigateToUser(username: string) {
    if (isAlreadyOnUserPage(username)) return true;
    logger.log(`Navigating to user ${username}`);

    const url = getUserPageUrl(username);
    const status = await gotoWithRetry(url);
    if (status === 404) {
      logger.warn("User page returned 404");
      return false;
    }

    if (status === 200) {
      // some pages return 200 but nothing there (I think deleted accounts)
      // https://github.com/mifi/SimpleInstaBot/issues/48
      // example: https://www.instagram.com/victorialarson__/
      // so we check if the page has the user's name on it
      const elementHandles = await page.$$(
        `xpath///body//main//*[contains(text(),${escapeXpathStr(username)})]`,
      );
      const foundUsernameOnPage = elementHandles.length > 0;
      if (!foundUsernameOnPage)
        logger.warn(`Cannot find text "${username}" on page`);
      return foundUsernameOnPage;
    }

    throw new Error(`Navigate to user failed with status ${status}`);
  }

  async function navigateToUserWithCheck(username: string) {
    if (!(await navigateToUser(username))) throw new Error("User not found");
  }

  async function navigateToUserAndGetProfileIdFromHtml(username: string) {
    await navigateToUser(username);

    const profileId = await page.evaluate(() => {
      const content = document.body.innerHTML;
      const regex = /"profile_id":"(\d+)"/;
      const match = RegExp(regex).exec(content);
      return match ? match[1] : null;
    });

    logger.log(`Got profile id ${profileId} for user ${username}`);
    return profileId;
  }

  async function navigateToUserAndGetProfileId(username: string) {
    let id: string | null | undefined = null;
    id = await navigateToUserAndGetProfileIdFromHtml(username);

    if (!id) {
      const user = await navigateToUserAndGetData(username);
      id = user.id;
    }

    return id;
  }

  async function navigateToUserAndGetData(username: string): Promise<User> {
    const cachedUserData = userDataCache[username];

    if (isAlreadyOnUserPage(username)) {
      // assume we have data
      return cachedUserData;
    }

    if (cachedUserData != null) {
      // if we already have userData, just navigate
      await navigateToUserWithCheck(username);
      return cachedUserData;
    }

    async function getUserDataFromPage() {
      // https://github.com/mifi/instauto/issues/115#issuecomment-1199335650
      // to test in browser: document.getElementsByTagName('html')[0].innerHTML.split('\n');
      try {
        const body = await page.content();
        for (let q of body.split(/\r?\n/) as any) {
          if (q.includes("edge_followed_by")) {
            q = q.split(",[],[")[1];

            q = q.split("]]]")[0];
            q = JSON.parse(q);

            q = q.data.__bbox.result.response;
            q = q.replace(/\\/g, "");
            q = JSON.parse(q);
            return q.data.user;
          }
        }
      } catch (err) {
        logger.warn(
          `Unable to get user data from page (${username}) - This is normal`,
          err,
        );
      }
      return undefined;
    }

    // intercept special XHR network request that fetches user's data and store it in a cache
    // TODO fallback to DOM to get user ID if this request fails?
    // https://github.com/mifi/SimpleInstaBot/issues/125#issuecomment-1145354294
    async function getUserDataFromInterceptedRequest() {
      const t = setTimeout(async () => {
        logger.log("Unable to intercept request, will send manually");
        try {
          await page.evaluate(async (username2) => {
            const response = await window.fetch(
              `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username2.toLowerCase())}`,
              {
                mode: "cors",
                credentials: "include",
                headers: { "x-ig-app-id": "936619743392459" },
              },
            );
            await response.json();
          }, username);
          // todo `https://i.instagram.com/api/v1/users/${userId}/info/`
          // https://www.javafixing.com/2022/07/fixed-can-get-instagram-profile-picture.html?m=1
        } catch (err) {
          logger.error("Failed to manually send request: ", err);
        }
      }, 5000);

      try {
        const [foundResponse] = await Promise.all([
          page.waitForResponse(
            (response) => {
              const request = response.request();
              return (
                request.method() === "GET" &&
                new RegExp(
                  `https:\\/\\/i\\.instagram\\.com\\/api\\/v1\\/users\\/web_profile_info\\/\\?username=${encodeURIComponent(username.toLowerCase())}`,
                ).test(request.url())
              );
            },
            { timeout: 30000 },
          ),
          navigateToUserWithCheck(username),
        ]);

        const json = JSON.parse(await foundResponse.text());
        return json.data.user;
      } finally {
        clearTimeout(t);
      }
    }

    logger.log("Trying to get user data from HTML");

    await navigateToUserWithCheck(username);
    let userData = await getUserDataFromPage();
    if (userData) {
      userDataCache[username] = userData;
      return userData;
    }

    logger.log("Need to intercept network request to get user data");

    // works for old accounts only:
    userData = await getUserDataFromInterceptedRequest();
    if (userData) {
      userDataCache[username] = userData;
      return userData;
    }

    return { username, time: new Date().getTime(), href: "" };
  }

  async function isUserPrivate() {
    const isPrivate = await page.$$(
      `xpath///body//main//*[contains(text(),${escapeXpathStr("This account is private")})]`,
    );

    return isPrivate.length > 0;
  }

  // How to test xpaths in the browser:
  // document.evaluate("your xpath", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null ).singleNodeValue
  async function findButtonWithText(text: string) {
    // todo escape text?

    // button seems to look like this now:
    // <button class="..."><div class="...">Follow</div></button>
    // https://sqa.stackexchange.com/questions/36918/xpath-text-buy-now-is-working-but-not-containstext-buy-now
    // https://github.com/mifi/SimpleInstaBot/issues/106
    let elementHandles = await page.$$(
      `xpath///header//button[contains(.,'${text}')]`,
    );
    if (elementHandles.length > 0) return elementHandles[0];

    // old button:
    elementHandles = await page.$$(`xpath///header//button[text()='${text}']`);
    if (elementHandles.length > 0) return elementHandles[0];

    return undefined;
  }

  async function findFollowButton() {
    let button = await findButtonWithText("Follow");
    if (button) return button;

    button = await findButtonWithText("Follow Back");
    if (button) return button;

    return undefined;
  }

  async function findUnfollowButton() {
    let button = await findButtonWithText("Following");
    if (button) return button;

    button = await findButtonWithText("Requested");
    if (button) return button;

    let elementHandles = await page.$$(
      "xpath///header//button[*//span[@aria-label='Following']]",
    );
    if (elementHandles.length > 0) return elementHandles[0];

    elementHandles = await page.$$(
      "xpath///header//button[*//span[@aria-label='Requested']]",
    );
    if (elementHandles.length > 0) return elementHandles[0];

    elementHandles = await page.$$(
      "xpath///header//button[*//*[name()='svg'][@aria-label='Following']]",
    );
    if (elementHandles.length > 0) return elementHandles[0];

    elementHandles = await page.$$(
      "xpath///header//button[*//*[name()='svg'][@aria-label='Requested']]",
    );
    if (elementHandles.length > 0) return elementHandles[0];

    return undefined;
  }

  async function findUnfollowConfirmButton() {
    let elementHandles = await page.$$("xpath///button[text()='Unfollow']");
    if (elementHandles.length > 0) return elementHandles[0];

    // https://github.com/mifi/SimpleInstaBot/issues/191
    elementHandles = await page.$$(
      "xpath///*[@role='button'][contains(.,'Unfollow')]",
    );
    return elementHandles[0];
  }

  async function followUser(username: string) {
    await navigateToUserAndGetData(username);
    const unfollowButton = await findUnfollowButton();

    if (unfollowButton) {
      logger.log("We are already following this user");
      await sleep(5000);
      return;
    }

    const elementHandle = await findFollowButton();

    if (!elementHandle) {
      throw new Error("Follow button not found");
    }

    logger.log(`Following user ${username}`);

    if (!dryRun) {
      await elementHandle.click();
      await sleep(5000);

      await checkActionBlocked(page, browser);

      const elementHandle2 = await findUnfollowButton();

      // Don't want to retry this user over and over in case there is an issue https://github.com/mifi/instauto/issues/33#issuecomment-723217177
      const entry: User = { username, time: new Date().getTime(), href: "" };
      if (!elementHandle2) entry.failed = true;

      await addPrevFollowedUser(entry);

      if (!elementHandle2) {
        logger.log("Button did not change state - Sleeping 1 min");
        await sleep(60000);
        throw new Error("Button did not change state");
      }
    }

    await sleep(1000);
  }

  // See https://github.com/timgrossmann/InstaPy/pull/2345
  // https://github.com/timgrossmann/InstaPy/issues/2355
  async function unfollowUser(username: string) {
    await navigateToUserAndGetData(username);
    logger.log(`Unfollowing user ${username}`);

    const res: User = { username, time: new Date().getTime(), href: "" };

    const elementHandle = await findUnfollowButton();
    if (!elementHandle) {
      const elementHandle2 = await findFollowButton();
      if (elementHandle2) {
        logger.log("User has been unfollowed already");
        res.noActionTaken = true;
      } else {
        logger.log("Failed to find unfollow button");
        res.noActionTaken = true;
      }
    }

    if (!dryRun) {
      if (elementHandle) {
        await elementHandle.click();
        await sleep(1000);
        const confirmHandle = await findUnfollowConfirmButton();
        if (confirmHandle) await confirmHandle.click();

        await sleep(5000);

        await checkActionBlocked(page, browser);

        const elementHandle2 = await findFollowButton();
        if (!elementHandle2)
          throw new Error("Unfollow button did not change state");
      }

      await addPrevUnfollowedUser(res);
    }

    await sleep(1000);

    return res;
  }

  async function* graphqlQueryUsers({
    queryHash,
    getResponseProp,
    graphqlVariables: graphqlVariablesIn,
  }: {
    queryHash: string;
    getResponseProp: (json: any) => any;
    graphqlVariables: any;
  }) {
    const graphqlUrl = `${INSTAGRAM_URL}/graphql/query/?query_hash=${queryHash}`;

    const graphqlVariables = {
      first: 50,
      ...graphqlVariablesIn,
    };

    const outUsers: string[] = [];

    let hasNextPage = true;
    let i = 0;

    while (hasNextPage) {
      const url = `${graphqlUrl}&variables=${JSON.stringify(graphqlVariables)}`;

      await gotoUrl(url);
      const json = await getPageJson(page);

      const subProp = getResponseProp(json);
      const pageInfo = subProp.page_info;
      const { edges } = subProp;
      const ret: any[] = [];
      edges.forEach((e: any) => ret.push(e.node.username));

      graphqlVariables.after = pageInfo.end_cursor;
      hasNextPage = pageInfo.has_next_page;
      i += 1;

      if (hasNextPage) {
        logger.log(`Has more pages (current ${i})`);
      }

      yield ret;
    }

    return outUsers;
  }

  function getFollowersOrFollowingGenerator({
    userId,
    getFollowers = false,
  }: {
    userId: string;
    getFollowers: boolean;
  }) {
    return graphqlQueryUsers({
      getResponseProp: (json) =>
        json.data.user[getFollowers ? "edge_followed_by" : "edge_follow"],
      graphqlVariables: { id: userId },
      queryHash: getFollowers
        ? "37479f2b8209594dde7facb0d904896a"
        : "58712303d941c6855d4e888c5f0cd22f",
    });
  }

  async function getFollowersOrFollowing({
    userId,
    getFollowers = false,
  }: {
    userId: string;
    getFollowers: boolean;
  }) {
    let users: string[] = [];
    for await (const usersBatch of getFollowersOrFollowingGenerator({
      userId,
      getFollowers,
    })) {
      users = [...users, ...usersBatch];
    }
    return users;
  }

  function getUsersWhoLikedContent({ contentId }: { contentId: string }) {
    return graphqlQueryUsers({
      getResponseProp: (json) => json.data.shortcode_media.edge_liked_by,
      graphqlVariables: {
        shortcode: contentId,
        include_reel: true,
      },
      queryHash: "d5d763b1e2acf209d62d22d184488e57",
    });
  }

  async function likeCurrentUserImagesPageCode({
    dryRun: dryRunIn,
    likeImagesMin,
    likeImagesMax,
    shouldLikeMedia: shouldLikeMediaIn,
  }: {
    dryRun: boolean;
    likeImagesMin: number;
    likeImagesMax: number;
    shouldLikeMedia: (media: Media) => boolean;
  }) {
    const allImages = Array.from(document.getElementsByTagName("a")).filter(
      (el) => /\/p\//.test(el.href),
    );

    const imagesShuffled = shuffleArray(allImages);

    const numImagesToLike = Math.floor(
      Math.random() * (likeImagesMax + 1 - likeImagesMin) + likeImagesMin,
    );

    logger.log(`Liking ${numImagesToLike} image(s)`);

    const images = imagesShuffled.slice(0, numImagesToLike);

    if (images.length < 1) {
      logger.log("No images to like");
      return;
    }

    for (const image of images) {
      await image.click();

      await sleep(3000);

      const dialog = document.querySelector("*[role=dialog]");

      if (!dialog) throw new Error("Dialog not found");

      const section = Array.from(dialog.querySelectorAll("section")).find(
        (s) =>
          s.querySelectorAll('*[aria-label="Like"]')[0] &&
          s.querySelectorAll('*[aria-label="Comment"]')[0],
      );

      if (!section) throw new Error("Like button section not found");

      const likeButtonChild = section.querySelectorAll(
        '*[aria-label="Like"]',
      )[0];

      if (!likeButtonChild)
        throw new Error("Like button not found (aria-label)");

      function findClickableParent(el: any) {
        let elAt = el;
        while (elAt) {
          if (elAt.click) {
            return elAt;
          }
          elAt = elAt.parentElement;
        }
        return undefined;
      }

      const foundClickable = findClickableParent(likeButtonChild);

      if (!foundClickable) throw new Error("Like button not found");

      function likeImage() {
        if (
          shouldLikeMediaIn !== null &&
          typeof shouldLikeMediaIn === "function"
        ) {
          const presentation = dialog?.querySelector(
            "article[role=presentation]",
          );
          const img = presentation?.querySelector('img[alt^="Photo by "]');
          const video = presentation?.querySelector('video[type="video/mp4"]');
          const mediaDesc = presentation?.querySelector(
            "[role=menuitem] h2 ~ div",
          )?.textContent;
          let mediaType;
          let src;
          let alt;
          let poster;
          if (img) {
            mediaType = "image";
            ({ src } = img as HTMLImageElement);
            ({ alt } = img as HTMLImageElement);
          } else if (video) {
            mediaType = "video";
            ({ poster } = video as HTMLVideoElement);
            ({ src } = video as HTMLVideoElement);
          } else {
            logger.log("Could not determin mediaType");
          }

          if (
            !shouldLikeMediaIn({
              mediaType,
              mediaDesc,
              src,
              alt,
              poster,
            } as Media)
          ) {
            logger.log(
              `shouldLikeMedia returned false for ${image.href}, skipping`,
            );
            return;
          }
        }

        foundClickable.click();
        onImageLiked({ username: image.href, href: image.href });
      }

      if (!dryRunIn) {
        likeImage();
      }

      await sleep(3000);

      const closeButtonChild = document.querySelector(
        'svg[aria-label="Close"]',
      );

      if (!closeButtonChild)
        throw new Error("Close button not found (aria-label)");

      const closeButton = findClickableParent(closeButtonChild);

      if (!closeButton) throw new Error("Close button not found");

      closeButton.click();

      await sleep(5000);
    }

    logger.log("Done liking images");
  }

  async function likeUserImages({
    username,
    likeImagesMin = 0,
    likeImagesMax = 0,
  }: {
    username: string;
    likeImagesMin: number;
    likeImagesMax: number;
  }) {
    if (
      !likeImagesMin ||
      !likeImagesMax ||
      likeImagesMax < likeImagesMin ||
      likeImagesMin < 1
    )
      throw new Error("Invalid arguments");

    await navigateToUserAndGetData(username);

    logger.log(`Liking ${likeImagesMin}-${likeImagesMax} user images`);
    try {
      await page.exposeFunction("instautoSleep", sleep);
      await page.exposeFunction("instautoLog", (...args: any[]) =>
        console.log(...args),
      );
      await page.exposeFunction("instautoOnImageLiked", (href: string) =>
        onImageLiked({ username, href }),
      );
    } catch (err) {
      logger.log("Failed to expose functions", err);
    }

    // TODO: Type correctly
    await page.evaluate(likeCurrentUserImagesPageCode as any, {
      dryRun: dryRun,
      likeImagesMin,
      likeImagesMax,
      shouldLikeMedia: likeMediaFilterFn,
    });
  }

  async function followUserRespectingRestrictions({
    username,
    skipPrivate = false,
  }: {
    username: string;
    skipPrivate: boolean;
  }) {
    if (db.prevFollowedUsers[username]) {
      logger.log("Skipping already followed user", username);
      return false;
    }

    const graphqlUser = await navigateToUserAndGetData(username);

    const {
      followedByCount = 0,
      followsCount = 0,
      isPrivate = false,
      isVerified = false,
      isBusinessAccount = false,
      isProfessionalAccount = false,
      fullName = "",
      biography = "",
      profilePicUrlHd = "",
      externalUrl = "",
      businessCategoryName = "",
      categoryName = "",
    } = graphqlUser;

    const isPrivate2 = await isUserPrivate();

    const ratio = followedByCount / (followsCount || 1);

    if (isPrivate || (isPrivate2 && skipPrivate)) {
      logger.log("User is private, skipping");
      return false;
    }
    if (
      (followUserWithMaxFollowers != null &&
        followedByCount > followUserWithMaxFollowers) ||
      (followUserWithMaxFollowing != null &&
        followsCount > followUserWithMaxFollowing) ||
      (followUserWithMinFollowers != null &&
        followedByCount < followUserWithMinFollowers) ||
      (followUserWithMinFollowing != null &&
        followsCount < followUserWithMinFollowing)
    ) {
      logger.log(
        "User has too many or too few followers or following, skipping.",
        "followedByCount:",
        followedByCount,
        "followsCount:",
        followsCount,
      );
      return false;
    }
    if (
      (followUserRatioMax != null && ratio > followUserRatioMax) ||
      (followUserRatioMin != null && ratio < followUserRatioMin)
    ) {
      logger.log(
        "User has too many followers compared to follows or opposite, skipping",
      );
      return false;
    }
    if (
      followUserFilterFn !== null &&
      typeof followUserFilterFn === "function" &&
      !followUserFilterFn({
        username,
        isVerified,
        isBusinessAccount,
        isProfessionalAccount,
        fullName,
        biography,
        profilePicUrlHd,
        externalUrl,
        businessCategoryName,
        categoryName,
      }) === true
    ) {
      logger.log(
        `Custom follow logic returned false for ${username}, skipping`,
      );
      return false;
    }

    await followUser(username);

    await sleep(30000);
    await throttle(db);

    return true;
  }

  async function processUserFollowers(
    username: string,
    {
      maxFollowsPerUser = 5,
      skipPrivate = false,
      enableLikeImages = false,
      likeImagesMin = 0,
      likeImagesMax = 0,
    }: {
      maxFollowsPerUser: number;
      skipPrivate: boolean;
      enableLikeImages: boolean;
      likeImagesMin: number;
      likeImagesMax: number;
    },
  ) {
    const enableFollow = maxFollowsPerUser > 0;

    if (enableFollow)
      logger.log(
        `Following up to ${maxFollowsPerUser} followers of ${username}`,
      );
    if (enableLikeImages)
      logger.log(
        `Liking images of up to ${likeImagesMax} followers of ${username}`,
      );

    await throttle(db);

    let numFollowedForThisUser = 0;

    const userId = await navigateToUserAndGetProfileId(username);

    if (!userId) throw new Error("User ID not found");

    for await (const followersBatch of getFollowersOrFollowingGenerator({
      userId,
      getFollowers: true,
    })) {
      logger.log("User followers batch", followersBatch);

      for (const follower of followersBatch) {
        await throttle(db);

        try {
          if (enableFollow && numFollowedForThisUser >= maxFollowsPerUser) {
            logger.log("Have reached followed limit for this user, stopping");
            return;
          }

          let didActuallyFollow = false;
          if (enableFollow)
            didActuallyFollow = await followUserRespectingRestrictions({
              username: follower,
              skipPrivate,
            });
          if (didActuallyFollow) {
            numFollowedForThisUser += 1;
            logger.log(
              `Followed ${numFollowedForThisUser}/${maxFollowsPerUser} users for ${username}`,
            );
          }

          const didFailToFollow = enableFollow && !didActuallyFollow;

          if (enableLikeImages && !didFailToFollow) {
            // Note: throws error if user isPrivate
            await likeUserImages({
              username: follower,
              likeImagesMin,
              likeImagesMax,
            });
          }
        } catch (err) {
          logger.error(`Failed to process follower ${follower}`, err);
          await takeScreenshot(page);
          await sleep(20000);
        }
      }
    }
  }

  async function processUsersFollowers({
    usersToFollowFollowersOf,
    maxFollowsTotal = 150,
    skipPrivate,
    enableFollow = true,
    enableLikeImages = false,
    likeImagesMin = 1,
    likeImagesMax = 2,
  }: {
    usersToFollowFollowersOf: string[];
    maxFollowsTotal?: number;
    skipPrivate: boolean;
    enableFollow?: boolean;
    enableLikeImages?: boolean;
    likeImagesMin?: number;
    likeImagesMax?: number;
  }) {
    // If maxFollowsTotal turns out to be lower than the user list size, slice off the user list
    const usersToFollowFollowersOfSliced = shuffleArray(
      usersToFollowFollowersOf,
    ).slice(0, maxFollowsTotal);

    const maxFollowsPerUser =
      enableFollow && usersToFollowFollowersOfSliced.length > 0
        ? Math.floor(maxFollowsTotal / usersToFollowFollowersOfSliced.length)
        : 0;

    if (
      maxFollowsPerUser === 0 &&
      (!enableLikeImages || likeImagesMin < 1 || likeImagesMax < 1)
    ) {
      logger.warn("Nothing to follow or like");
      return;
    }

    for (const username of usersToFollowFollowersOfSliced) {
      try {
        await processUserFollowers(username, {
          maxFollowsPerUser,
          skipPrivate,
          enableLikeImages,
          likeImagesMin,
          likeImagesMax,
        });

        await sleep(10 * 60 * 1000);
        await throttle(db);
      } catch (err) {
        if (err instanceof Error && err.name === "DailyLimitReachedError") {
          logger.log("Daily limit reached, stopping:", err.message);
          return; // Exit the loop cleanly
        }
        logger.error(
          "Failed to process user followers, continuing",
          username,
          err,
        );
        await takeScreenshot(page);
        await sleep(60 * 1000);
      }
    }
  }

  async function safelyUnfollowUserList(
    usersToUnfollow: AsyncGenerator<any[], string[], unknown>,
    limit: number,
    condition: (username: string) => Promise<boolean>,
  ) {
    logger.log("Unfollowing users, up to limit", limit);

    let peopleProcessed = 0;
    let peopleUnfollowed = 0;

    for await (const listOrUsername of usersToUnfollow) {
      // backward compatible:
      const list = Array.isArray(listOrUsername)
        ? listOrUsername
        : [listOrUsername];

      for (const username of list) {
        if (await condition(username)) {
          try {
            const userFound = await navigateToUser(username);

            if (!userFound) {
              // to avoid repeatedly unfollowing failed users, flag them as already unfollowed
              logger.log("User not found for unfollow");
              await addPrevUnfollowedUser({
                username,
                time: new Date().getTime(),
                noActionTaken: true,
              });
              await sleep(3000);
            } else {
              const { noActionTaken } = await unfollowUser(username);

              if (noActionTaken) {
                await sleep(3000);
              } else {
                await sleep(15000);
                peopleUnfollowed += 1;

                if (peopleUnfollowed % 10 === 0) {
                  logger.log(
                    "Have unfollowed 10 users since last break, pausing 10 min",
                  );
                  await sleep(10 * 60 * 1000, 0.1);
                }
              }
            }

            peopleProcessed += 1;
            logger.log(
              `Have now unfollowed (or tried to unfollow) ${peopleProcessed} users`,
            );

            if (limit && peopleUnfollowed >= limit) {
              logger.log(`Have unfollowed limit of ${limit}, stopping`);
              return peopleUnfollowed;
            }

            await throttle(db);
          } catch (err) {
            logger.error("Failed to unfollow, continuing with next", err);
          }
        }
      }
    }

    logger.log("Done with unfollowing", peopleProcessed, peopleUnfollowed);

    return peopleUnfollowed;
  }

  async function safelyFollowUserList({
    users,
    skipPrivate,
    limit,
  }: {
    users: string[];
    skipPrivate: boolean;
    limit: number;
  }) {
    logger.log("Following users, up to limit", limit);

    for (const username of users) {
      await throttle(db);

      try {
        await followUserRespectingRestrictions({ username, skipPrivate });
      } catch (err) {
        logger.error(`Failed to follow user ${username}, continuing`, err);
        await takeScreenshot(page);
        await sleep(20000);
      }
    }
  }

  function getPage() {
    return page;
  }

  async function doesUserFollowMe(username: string) {
    try {
      logger.info("Checking if user", username, "follows us");
      const userId = await navigateToUserAndGetProfileId(username);

      const elementHandles = await page.$$(
        "xpath///a[contains(.,' following')][contains(@href,'/following')]",
      );
      if (elementHandles.length === 0)
        throw new Error("Following button not found");

      const [foundResponse] = await Promise.all([
        page.waitForResponse((response) => {
          const request = response.request();
          return (
            request.method() === "GET" &&
            new RegExp(
              `instagram.com/api/v1/friendships/${userId}/following/`,
            ).test(request.url())
          );
        }),
        elementHandles[0].click(),
      ]);

      const { users } = JSON.parse(await foundResponse.text());
      if (users.length < 2) throw new Error("Unable to find user follows list");
      return users.some(
        (user: { pk: string; username: string }) =>
          String(user.pk) === String(myUserId) || user.username === username,
      ); // If they follow us, we will show at the top of the list
    } catch (err) {
      logger.error("Failed to check if user follows us", err);
      return undefined;
    }
  }

  async function unfollowNonMutualFollowers({ limit }: { limit: number }) {
    logger.log(`Unfollowing non-mutual followers (limit ${limit})...`);

    const allFollowingGenerator = getFollowersOrFollowingGenerator({
      userId: myUserId || "",
      getFollowers: false,
    });

    async function condition(username: string) {
      if (excludeUsers.includes(username)) return false; // User is excluded by exclude list
      if (haveRecentlyFollowedUser(username)) {
        logger.log(`Have recently followed user ${username}, skipping`);
        return false;
      }

      const followsMe = await doesUserFollowMe(username);
      logger.info("User follows us?", followsMe);
      return followsMe === false;
    }

    return safelyUnfollowUserList(allFollowingGenerator, limit, condition);
  }

  async function unfollowAllUnknown({ limit }: { limit: number }) {
    logger.log("Unfollowing all except excludes and auto followed");

    const unfollowUsersGenerator = getFollowersOrFollowingGenerator({
      userId: myUserId || "",
      getFollowers: false,
    });

    async function condition(username: string) {
      if (db.prevFollowedUsers[username]) return false; // we followed this user, so it's not unknown
      if (excludeUsers.includes(username)) return false; // User is excluded by exclude list
      return true;
    }

    return safelyUnfollowUserList(unfollowUsersGenerator, limit, condition);
  }

  async function unfollowOldFollowed({
    ageInDays,
    limit,
  }: {
    ageInDays: number;
    limit: number;
  }) {
    assert(ageInDays);

    logger.log(
      `Unfollowing currently followed users who were auto-followed more than ${ageInDays} days ago (limit ${limit})...`,
    );

    const followingUsersGenerator = getFollowersOrFollowingGenerator({
      userId: myUserId || "",
      getFollowers: false,
    });

    async function condition(username: string) {
      return (
        db.prevFollowedUsers[username] &&
        !excludeUsers.includes(username) &&
        (new Date().getTime() - db.prevFollowedUsers[username].time) /
          (1000 * 60 * 60 * 24) >
          ageInDays
      );
    }

    return safelyUnfollowUserList(followingUsersGenerator, limit, condition);
  }

  async function listManuallyFollowedUsers() {
    const allFollowing = await getFollowersOrFollowing({
      userId: myUserId || "",
      getFollowers: false,
    });

    return allFollowing.filter(
      (u) => !db.prevFollowedUsers[u] && !excludeUsers.includes(u),
    );
  }

  return {
    followUserFollowers: processUserFollowers,
    unfollowNonMutualFollowers,
    unfollowAllUnknown,
    unfollowOldFollowed,
    followUser,
    unfollowUser,
    likeUserImages,
    sleep,
    listManuallyFollowedUsers,
    getFollowersOrFollowing,
    getUsersWhoLikedContent,
    safelyUnfollowUserList,
    safelyFollowUserList,
    getPage,
    followUsersFollowers: processUsersFollowers,
    doesUserFollowMe,
    navigateToUserAndGetData,
  };
};

Instauto.jsonDb = jsonDb;

export default Instauto;
