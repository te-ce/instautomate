import { colorName, log } from "src/util/logger";
import { gotoUrl, navigateToUser } from "./navigation";
import { LIMIT_COLOR, INSTAGRAM_URL } from "src/util/const";
import { Page } from "puppeteer";
import { getPageJson, shuffleArray, sleep } from "src/util/util";
import { takeScreenshot } from "./screenshot";
import { throttle } from "./trottle";
import { getJsonDb } from "src/db/db";
import { likeUserImages } from "./interaction/likeImage";
import { User } from "src/util/types";
import { isAlreadyOnUserPage } from "src/util/status";
import { followUserRespectingRestrictions } from "./interaction/follow";

async function* graphqlQueryUsers({
  queryHash,
  getResponseProp,
  graphqlVariables: graphqlVariablesIn,
  page,
}: {
  queryHash: string;
  getResponseProp: (json: any) => any;
  graphqlVariables: any;
  page: Page;
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

    await gotoUrl(page, url);
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
      log(`Has more pages (current ${i})`);
    }

    yield ret;
  }

  return outUsers;
}

export function getFollowersOrFollowingGenerator({
  userId,
  getFollowers = false,
  page,
}: {
  userId: string;
  getFollowers: boolean;
  page: Page;
}) {
  return graphqlQueryUsers({
    getResponseProp: (json) =>
      json.data.user[getFollowers ? "edge_followed_by" : "edge_follow"],
    graphqlVariables: { id: userId },
    queryHash: getFollowers
      ? "37479f2b8209594dde7facb0d904896a"
      : "58712303d941c6855d4e888c5f0cd22f",
    page,
  });
}

export async function getFollowersOrFollowing({
  userId,
  getFollowers = false,
  page,
}: {
  userId: string;
  getFollowers: boolean;
  page: Page;
}) {
  let users: string[] = [];
  for await (const usersBatch of getFollowersOrFollowingGenerator({
    userId,
    getFollowers,
    page,
  })) {
    users = [...users, ...usersBatch];
  }
  return users;
}

export function getUsersWhoLikedContent({
  contentId,
  page,
}: {
  contentId: string;
  page: Page;
}) {
  return graphqlQueryUsers({
    getResponseProp: (json) => json.data.shortcode_media.edge_liked_by,
    graphqlVariables: {
      shortcode: contentId,
      include_reel: true,
    },
    queryHash: "d5d763b1e2acf209d62d22d184488e57",
    page,
  });
}

export async function processUserFollowers({
  username,
  maxFollowsPerUser = 5,
  skipPrivate = false,
  enableLikeImages = false,
  likeImagesMin = 0,
  likeImagesMax = 0,
  page,
  userDataCache,
}: {
  username: string;
  maxFollowsPerUser: number;
  skipPrivate: boolean;
  enableLikeImages: boolean;
  likeImagesMin: number;
  likeImagesMax: number;
  page: Page;
  userDataCache: Record<string, User>;
}) {
  const enableFollow = maxFollowsPerUser > 0;

  if (enableFollow)
    log(
      `Following up to ${maxFollowsPerUser} followers of ${colorName(username)}`,
    );
  if (enableLikeImages)
    log(
      `Liking images of up to ${likeImagesMax} followers of ${colorName(username)}`,
    );

  await throttle();

  let numFollowedForThisUser = 0;

  const userId = await navigateToUserAndGetProfileId(
    username,
    page,
    userDataCache,
  );

  if (!userId) throw new Error("User ID not found");

  for await (const followersBatch of getFollowersOrFollowingGenerator({
    userId,
    getFollowers: true,
    page,
  })) {
    log("User followers batch", JSON.stringify(followersBatch));

    const shuffledFollowers = shuffleArray(followersBatch);
    for (const follower of shuffledFollowers) {
      await throttle();

      try {
        if (enableFollow && numFollowedForThisUser >= maxFollowsPerUser) {
          log("Have reached followed limit for this user, stopping");
          return;
        }

        let didActuallyFollow = false;
        if (enableFollow)
          didActuallyFollow = await followUserRespectingRestrictions({
            username: follower,
            skipPrivate,
            page,
            userDataCache,
          });
        if (didActuallyFollow) {
          numFollowedForThisUser += 1;
          log(
            `${LIMIT_COLOR}Followed ${numFollowedForThisUser}/${maxFollowsPerUser} users for ${colorName(username)}`,
          );
        }

        const didFailToFollow = enableFollow && !didActuallyFollow;

        if (enableLikeImages && !didFailToFollow) {
          // Note: throws error if user isPrivate
          await likeUserImages({
            username: follower,
            likeImagesMin,
            likeImagesMax,
            page,
            userDataCache,
          });
        }
      } catch (err) {
        log(`Failed to process follower ${follower}`, err);
        await takeScreenshot(page);
        await sleep({ seconds: 10 });
      }
    }
  }
}

export async function processUsersFollowers({
  usersToFollowFollowersOf,
  maxFollowsTotal = 150,
  skipPrivate,
  enableFollow = true,
  enableLikeImages = false,
  likeImagesMin = 1,
  likeImagesMax = 2,
  page,
  userDataCache,
}: {
  usersToFollowFollowersOf: string[];
  maxFollowsTotal?: number;
  skipPrivate: boolean;
  enableFollow?: boolean;
  enableLikeImages?: boolean;
  likeImagesMin?: number;
  likeImagesMax?: number;
  page: Page;
  userDataCache: Record<string, User>;
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
    log("Nothing to follow or like");
    return;
  }

  for (const username of usersToFollowFollowersOfSliced) {
    try {
      await processUserFollowers({
        username,
        maxFollowsPerUser,
        skipPrivate,
        enableLikeImages,
        likeImagesMin,
        likeImagesMax,
        page,
        userDataCache,
      });

      await sleep({ minutes: 2 });
      await throttle();
    } catch (err) {
      if (err instanceof Error && err.name === "DailyLimitReachedError") {
        log("Daily limit reached, stopping:", err.message);
        return; // Exit the loop cleanly
      }
      log("Failed to process user followers, continuing", username, err);
      await takeScreenshot(page);
      await sleep({ minutes: 1 });
    }
  }
}

export async function listManuallyFollowedUsers({
  myUserId,
  excludeUsers,
  page,
}: {
  myUserId: string;
  excludeUsers: string[];
  page: Page;
}) {
  const db = await getJsonDb();

  const allFollowing = await getFollowersOrFollowing({
    userId: myUserId || "",
    getFollowers: false,
    page,
  });

  return allFollowing.filter(
    (u) => !db.prevFollowedUsers[u] && !excludeUsers.includes(u),
  );
}

export async function navigateToUserWithCheck(username: string, page: Page) {
  if (!(await navigateToUser(page, username)))
    throw new Error("User not found");
}

export async function navigateToUserAndGetProfileIdFromHtml({
  username,
  page,
}: {
  username: string;
  page: Page;
}) {
  await navigateToUser(page, username);

  const profileId = await page.evaluate(() => {
    const content = document.body.innerHTML;
    const regex = /"profile_id":"(\d+)"/;
    const match = RegExp(regex).exec(content);
    return match ? match[1] : null;
  });

  log(`Got profile id ${profileId} for user ${colorName(username)}`);
  return profileId;
}

export async function navigateToUserAndGetProfileId(
  username: string,
  page: Page,
  userDataCache: Record<string, User>,
) {
  let id: string | null | undefined = null;
  id = await navigateToUserAndGetProfileIdFromHtml({ username, page });

  if (!id) {
    const user = await navigateToUserAndGetData({
      username,
      page,
      userDataCache,
    });
    id = user.id;
  }

  return id;
}

export async function navigateToUserAndGetData({
  username,
  page,
  userDataCache,
}: {
  username: string;
  page: Page;
  userDataCache: Record<string, User>;
}): Promise<User> {
  const cachedUserData = userDataCache[username];

  if (isAlreadyOnUserPage(page, username)) {
    // assume we have data
    return cachedUserData;
  }

  if (cachedUserData != null) {
    // if we already have userData, just navigate
    await navigateToUserWithCheck(username, page);
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
      log(
        `Unable to get user data from page (${colorName(username)}) - This is normal`,
        err,
      );
    }
    return undefined;
  }

  // TODO: this is not working and most likely triggers some instagram violation
  // intercept special XHR network request that fetches user's data and store it in a cache
  // TODO fallback to DOM to get user ID if this request fails?
  // https://github.com/mifi/SimpleInstaBot/issues/125#issuecomment-1145354294
  // log("Need to intercept network request to get user data");
  // async function getUserDataFromInterceptedRequest() {
  //   const t = setTimeout(async () => {
  //     log("Unable to intercept request, will send manually");
  //     try {
  //       await page.evaluate(async (username2) => {
  //         const response = await window.fetch(
  //           `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username2.toLowerCase())}`,
  //           {
  //             mode: "cors",
  //             credentials: "include",
  //             headers: { "x-ig-app-id": "936619743392459" },
  //           },
  //         );
  //         await response.json();
  //       }, username);
  //       // todo `https://i.instagram.com/api/v1/users/${userId}/info/`
  //       // https://www.javafixing.com/2022/07/fixed-can-get-instagram-profile-picture.html?m=1
  //     } catch (err) {
  //       log("Failed to manually send request: ", err);
  //     }
  //   }, 5000);

  //   try {
  //     const [foundResponse] = await Promise.all([
  //       page.waitForResponse(
  //         (response) => {
  //           const request = response.request();
  //           return (
  //             request.method() === "GET" &&
  //             new RegExp(
  //               `https:\\/\\/i\\.instagram\\.com\\/api\\/v1\\/users\\/web_profile_info\\/\\?username=${encodeURIComponent(username.toLowerCase())}`,
  //             ).test(request.url())
  //           );
  //         },
  //         { timeout: 30000 },
  //       ),
  //       navigateToUserWithCheck(username),
  //     ]);

  //     const json = JSON.parse(await foundResponse.text());
  //     return json.data.user;
  //   } finally {
  //     clearTimeout(t);
  //   }
  // }

  log("Trying to get user data from HTML");

  await navigateToUserWithCheck(username, page);
  const userData = await getUserDataFromPage();
  if (userData) {
    userDataCache[username] = userData;
    return userData;
  }

  // works for old accounts only:
  // userData = await getUserDataFromInterceptedRequest();
  if (userData) {
    userDataCache[username] = userData;
    return userData;
  }

  return { username, time: new Date().getTime(), href: "" };
}
