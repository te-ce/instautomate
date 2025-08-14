import { Browser, Page } from "puppeteer";
import { Options } from "src/util/types";
import { logger } from "src/util/logger";
import { sleep } from "src/util/util";
import UserAgent from "user-agents";
import { JsonDB } from "src/db/db";
import { DAY_IN_MS, HOUR_IN_MS } from "src/util/const";
import { isLoggedIn } from "src/util/status";
import { tryDeleteCookies, tryLoadCookies, trySaveCookies } from "./cookies";
import { goHome, tryPressButton } from "./navigation";

export const startup = async (
  page: Page,
  browser: Browser,
  options: Options,
  db: JsonDB,
) => {
  const { randomizeUserAgent, enableCookies, password, username } = options;
  const { getNumFollowedUsersThisTimeUnit, getLikedPhotosLastTimeUnit } = db;

  // https://github.com/mifi/SimpleInstaBot/issues/118#issuecomment-1067883091
  await page.setExtraHTTPHeaders({ "Accept-Language": "en" });

  if (randomizeUserAgent) {
    const userAgentGenerated = new UserAgent({ deviceCategory: "desktop" });
    await page.setUserAgent(userAgentGenerated.toString());
  }

  if (enableCookies) await tryLoadCookies(browser);

  async function tryClickLogin() {
    async function tryClickButton(xpath: string) {
      const btn = (await page.$$(`xpath/${xpath}`))[0];
      if (!btn) return false;
      await btn.click();
      return true;
    }

    if (await tryClickButton("//button[.//text() = 'Log In']")) return true;
    if (await tryClickButton("//button[.//text() = 'Log in']")) return true; // https://github.com/mifi/instauto/pull/110 https://github.com/mifi/instauto/issues/109
    return false;
  }

  await goHome(page);
  await sleep({ seconds: 1 });

  await tryPressButton(
    await page.$$('xpath///button[contains(text(), "Allow all cookies")]'),
    "Accept cookies dialog",
  );
  await tryPressButton(
    await page.$$('xpath///button[contains(text(), "Accept")]'),
    "Accept cookies dialog",
  );
  await tryPressButton(
    await page.$$(
      'xpath///button[contains(text(), "Only allow essential cookies")]',
    ),
    "Accept cookies dialog 2 button 1",
    10,
  );
  await tryPressButton(
    await page.$$(
      'xpath///button[contains(text(), "Allow essential and optional cookies")]',
    ),
    "Accept cookies dialog 2 button 2",
    10,
  );

  if (!(await isLoggedIn(page))) {
    if (!username || !password) {
      await tryDeleteCookies();
      throw new Error(
        "No longer logged in. Deleting cookies and aborting. Need to provide username/password",
      );
    }

    try {
      await page.click('a[href="/accounts/login/?source=auth_switcher"]');
      await sleep({ seconds: 1 });
    } catch (err) {
      logger.info("No login page button, assuming we are on login form", err);
    }

    // Mobile version https://github.com/mifi/SimpleInstaBot/issues/7
    await tryPressButton(
      await page.$$('xpath///button[contains(text(), "Log In")]'),
      "Login form button",
    );

    await page.type('input[name="username"]', username, { delay: 50 });
    await sleep({ seconds: 1 });
    await page.type('input[name="password"]', password, { delay: 50 });
    await sleep({ seconds: 1 });

    for (;;) {
      const didClickLogin = await tryClickLogin();
      if (didClickLogin) break;
      logger.warn(
        "Login button not found. Maybe you can help me click it? And also report an issue on github with a screenshot of what you're seeing :)",
      );
      await sleep({ seconds: 15 });
    }

    await sleep({ seconds: 30 });

    // Sometimes login button gets stuck with a spinner
    // https://github.com/mifi/SimpleInstaBot/issues/25
    if (!(await isLoggedIn(page))) {
      logger.log("Still not logged in, trying to reload loading page");
      await page.reload();
      await sleep({ minutes: 1 });
    }

    let warnedAboutLoginFail = false;
    while (!(await isLoggedIn(page))) {
      if (!warnedAboutLoginFail)
        logger.warn(
          'WARNING: Login has not succeeded. This could be because of an incorrect username/password, or a "suspicious login attempt"-message. You need to manually complete the process, or if really logged in, click the Instagram logo in the top left to go to the Home page.',
        );
      warnedAboutLoginFail = true;
      await sleep({ seconds: 5 });
    }

    await goHome(page);
    await sleep({ seconds: 1 });

    // Mobile version https://github.com/mifi/SimpleInstaBot/issues/7
    await tryPressButton(
      await page.$$('xpath///button[contains(text(), "Save Info")]'),
      "Login info dialog: Save Info",
    );
    // May sometimes be "Save info" too? https://github.com/mifi/instauto/pull/70
    await tryPressButton(
      await page.$$('xpath///button[contains(text(), "Save info")]'),
      "Login info dialog: Save info",
    );
  }

  await tryPressButton(
    await page.$$('xpath///button[contains(text(), "Not Now")]'),
    "Turn on Notifications dialog",
  );

  await trySaveCookies(browser);

  logger.log(
    `Have followed/unfollowed ${getNumFollowedUsersThisTimeUnit(HOUR_IN_MS)} in the last hour`,
  );
  logger.log(
    `Have followed/unfollowed ${getNumFollowedUsersThisTimeUnit(DAY_IN_MS)} in the last 24 hours`,
  );
  logger.log(
    `Have liked ${getLikedPhotosLastTimeUnit(DAY_IN_MS).length} images in the last 24 hours`,
  );
};
