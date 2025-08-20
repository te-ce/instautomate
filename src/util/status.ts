import { Page } from "puppeteer";
import { logger } from "./logger";
import { escapeXpathStr, getUserPageUrl, sleep } from "./util";
import { tryDeleteCookies } from "src/actions/cookies";
import { JsonDB } from "src/db/db";
import { getOptions } from "./options";
import { navigateToUserAndGetProfileId } from "src/actions/data";
import { User } from "./types";

export async function isLoggedIn(page: Page) {
  return (await page.$$('xpath///*[@aria-label="Home"]')).length === 1;
}

export async function isActionBlocked(page: Page) {
  if (
    (await page.$$('xpath///*[contains(text(), "Action Blocked")]')).length > 0
  )
    return true;
  if (
    (await page.$$('xpath///*[contains(text(), "Try Again Later")]')).length > 0
  )
    return true;
  return false;
}

export async function checkActionBlocked(page: Page) {
  if (await isActionBlocked(page)) {
    const hours = 3;
    logger.error(`Action Blocked, waiting ${hours} hours...`);
    await tryDeleteCookies();
    await sleep({ hours, silent: true });
    throw new Error("Aborted operation due to action blocked");
  }
}

export function isAlreadyOnUserPage(page: Page, username: string) {
  const url = getUserPageUrl(username);
  // optimization: already on URL? (ignore trailing slash)
  return page.url().replace(/\/$/, "") === url.replace(/\/$/, "");
}

export async function isUserPrivate(page: Page) {
  const isPrivate = await page.$$(
    `xpath///body//main//*[contains(text(),${escapeXpathStr("This account is private")})]`,
  );

  return isPrivate.length > 0;
}

export async function haveRecentlyFollowedUser(db: JsonDB, username: string) {
  const { dontUnfollowUntilTimeElapsed } = await getOptions();
  const followedUserEntry = db.prevFollowedUsers[username];

  if (!followedUserEntry) return false; // We did not previously follow this user, so don't know
  return (
    new Date().getTime() - followedUserEntry.time < dontUnfollowUntilTimeElapsed
  );
}

export async function doesUserFollowMe({
  page,
  username,
  myUserId,
  userDataCache,
}: {
  page: Page;
  username: string;
  myUserId: string;
  userDataCache: Record<string, User>;
}) {
  try {
    logger.info("Checking if user", username, "follows us");
    const userId = await navigateToUserAndGetProfileId(
      username,
      page,
      userDataCache,
    );

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
