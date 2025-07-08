import { ElementHandle, Page } from "puppeteer";
import { INSTAGRAM_URL } from "src/util/const";
import { logger } from "src/util/logger";
import { isAlreadyOnUserPage } from "src/util/status";
import { escapeXpathStr, getUserPageUrl, sleepSeconds } from "src/util/util";

export async function tryPressButton(
  elementHandles: ElementHandle[],
  name: string,
  sleepSec = 3,
) {
  try {
    if (elementHandles.length === 1) {
      logger.log(`Pressing button: ${name}`);
      elementHandles[0].click();
      await sleepSeconds(sleepSec);
    }
  } catch (err) {
    logger.warn(`Failed to press button: ${name}`, err);
  }
}

export const goHome = async (page: Page) => gotoUrl(page, `${INSTAGRAM_URL}/?hl=en`);

// See https://github.com/mifi/SimpleInstaBot/issues/140#issuecomment-1149105387
export const gotoUrl = async (page: Page, url: string) =>
  page.goto(url, {
    waitUntil: ["load", "domcontentloaded", "networkidle2"],
  });

export async function gotoWithRetry(page: Page, url: string) {
  const maxAttempts = 3;
  for (let attempt = 0; ; attempt += 1) {
    logger.log(`Goto ${url}`);
    const response = await gotoUrl(page, url);
    const status = response?.status();
    logger.log("Page loaded");
    await sleepSeconds(2);

    // https://www.reddit.com/r/Instagram/comments/kwrt0s/error_560/
    // https://github.com/mifi/instauto/issues/60
    if (![560, 429].includes(status ?? 0)) return status;

    if (attempt > maxAttempts) {
      throw new Error(
        `Navigate to user failed after ${maxAttempts} attempts, last status: ${status}`,
      );
    }

    logger.info(`Got ${status} - Retrying request later...`);
    if (status === 429)
      logger.warn(
        "429 Too Many Requests could mean that Instagram suspects you're using a bot. You could try to use the Instagram Mobile app from the same IP for a few days first",
      );
    await sleepSeconds((attempt + 1) * 30 * 60);
  }
}

export async function navigateToUser(page: Page, username: string) {
  if (isAlreadyOnUserPage(page, username)) return true;
  logger.log(`Navigating to user ${username}`);

  const url = getUserPageUrl(username);
  const status = await gotoWithRetry(page, url);
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
