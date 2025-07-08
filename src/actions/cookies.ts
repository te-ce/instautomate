import fs from "fs-extra";
import { Browser } from "puppeteer";
import { logger } from "../util/logger";
import { getOptions } from "../util/options";

export async function tryLoadCookies(browser: Browser) {
  const { cookiesPath } = await getOptions();

  try {
    const cookies = JSON.parse(await fs.readFile(cookiesPath, "utf8"));
    for (const cookie of cookies) {
      if (cookie.name !== "ig_lang") await browser.setCookie(cookie);
    }
  } catch (err) {
    logger.error("No cookies found", err);
  }
}

export async function trySaveCookies(browser: Browser) {
  const { cookiesPath } = await getOptions();

  try {
    logger.log("Saving cookies");
    const cookies = await browser.cookies();

    await fs.writeFile(cookiesPath, JSON.stringify(cookies, null, 2));
  } catch (err) {
    logger.error("Failed to save cookies", err);
  }
}

export async function tryDeleteCookies() {
  const { cookiesPath } = await getOptions();

  try {
    logger.log("Deleting cookies");
    await fs.unlink(cookiesPath);
  } catch (err) {
    logger.error("No cookies to delete", err);
  }
}
