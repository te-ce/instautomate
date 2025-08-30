import { Page } from "puppeteer";
import { colorName, log } from "./logger";
import { escapeXpathStr, getUserPageUrl, sleep } from "./util";
import { tryDeleteCookies } from "src/actions/cookies";
import { getJsonDb } from "src/db/db";
import { getOptions } from "./options";
import { DAY_IN_MS } from "./const";
import { navigateToUser } from "src/actions/navigation";

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
    log(`Action Blocked, waiting ${hours} hours...`);
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

export async function haveRecentlyFollowedUser(username: string) {
  const db = await getJsonDb();

  const { unfollowAfterDays } = await getOptions();
  const followedUserEntry = db.prevFollowedUsers[username];

  if (!followedUserEntry) return false; // We did not previously follow this user, so don't know
  return (
    new Date().getTime() - followedUserEntry.time <
    unfollowAfterDays.nonMutual * DAY_IN_MS
  );
}

export async function doesUserFollowMe({
  page,
  username,
}: {
  page: Page;
  username: string;
}) {
  const db = await getJsonDb();
  const { username: myUsername } = await getOptions();
  try {
    log.temp("Checking if user", username, "follows us");
    await navigateToUser(page, username);

    const followListButton = await page.$$(
      "xpath///a[contains(.,' following')][contains(@href,'/following')]",
    );

    if (followListButton.length === 0) {
      log("Following button not found");
      return false;
    }

    await followListButton[0].click();
    await sleep({ seconds: 4, silent: true });

    const span = await page.$$(
      `xpath///span[contains(text(), '${myUsername}')]`,
    );
    const followsMe = span.length > 0;

    if (followsMe) {
      await db.setUserFollowedMe(username);
    }

    log(`User ${colorName(username)} follows us: ${followsMe}`);
    return followsMe;
  } catch (err) {
    log("Failed to check if user follows us", err);
    return undefined;
  }
}
