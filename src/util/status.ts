import { Browser, Page } from "puppeteer";
import { Cookies } from "src/actions/cookies";
import { logger } from "./logger";
import { sleep } from "./util";

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

export async function checkActionBlocked(page: Page, browser: Browser) {
  const { tryDeleteCookies } = await Cookies(browser);
  if (await isActionBlocked(page)) {
    const hours = 3;
    logger.error(`Action Blocked, waiting ${hours} hours...`);
    await tryDeleteCookies();
    await sleep(hours * 60 * 60 * 1000);
    throw new Error("Aborted operation due to action blocked");
  }
}
