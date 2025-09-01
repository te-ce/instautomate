import puppeteer, { Browser, Page } from "puppeteer";
import { Options } from "src/util/types";
import { log, logStartup } from "src/util/logger";
import { sleep } from "src/util/util";
import UserAgent from "user-agents";
import { isLoggedIn } from "src/util/status";
import { tryDeleteCookies, tryLoadCookies, trySaveCookies } from "./cookies";
import { goHome, tryPressButton } from "./navigation";
import { getOptions } from "src/util/options";
import { throttle } from "./trottle";

export const initialization = async (
  page: Page,
  browser: Browser,
  options: Options,
) => {
  const { randomizeUserAgent, enableCookies, password, username } = options;

  await logStartup();

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
  await sleep({ seconds: 1, silent: true });

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
      await sleep({ seconds: 1, silent: true });
    } catch (err) {
      log("No login page button, assuming we are on login form", err);
    }

    // Mobile version https://github.com/mifi/SimpleInstaBot/issues/7
    await tryPressButton(
      await page.$$('xpath///button[contains(text(), "Log In")]'),
      "Login form button",
    );

    await page.type('input[name="username"]', username, { delay: 50 });
    await sleep({ seconds: 1, silent: true });
    await page.type('input[name="password"]', password, { delay: 50 });
    await sleep({ seconds: 1, silent: true });

    for (;;) {
      const didClickLogin = await tryClickLogin();
      if (didClickLogin) break;
      log(
        "Login button not found. Maybe you can help me click it? And also report an issue on github with a screenshot of what you're seeing :)",
      );
      await sleep({ seconds: 15 });
    }

    await sleep({ seconds: 30 });

    // Sometimes login button gets stuck with a spinner
    // https://github.com/mifi/SimpleInstaBot/issues/25
    if (!(await isLoggedIn(page))) {
      log("Still not logged in, trying to reload loading page");
      await page.reload();
      await sleep({ minutes: 1 });
    }

    let warnedAboutLoginFail = false;
    while (!(await isLoggedIn(page))) {
      if (!warnedAboutLoginFail)
        log(
          'WARNING: Login has not succeeded. This could be because of an incorrect username/password, or a "suspicious login attempt"-message. You need to manually complete the process, or if really logged in, click the Instagram logo in the top left to go to the Home page.',
        );
      warnedAboutLoginFail = true;
      await sleep({ seconds: 5, silent: true });
    }

    await goHome(page);
    await sleep({ seconds: 1, silent: true });

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
  await throttle();
};

export const setupBrowser = async () => {
  const options = await getOptions();
  const browser = await puppeteer.launch({
    executablePath: process.env.IS_RUNNING_ON_DOCKER
      ? "/usr/bin/chromium"
      : undefined,
    headless: options.headless,

    args: [
      // Needed for docker
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      // commented out to fix 'Navigating frame was detached' bug
      // see: https://github.com/puppeteer/puppeteer/issues/11515#issuecomment-2364155101
      // '--single-process',
      "--disable-gpu",

      // If you need to proxy: (see also https://www.chromium.org/developers/design-documents/network-settings)
      // '--proxy-server=127.0.0.1:9876',
    ],
  });

  return browser;
};
