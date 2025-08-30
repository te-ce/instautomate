import fs from "fs-extra";
import { Browser } from "puppeteer";
import { log } from "../util/logger";
import { getOptions } from "../util/options";

export async function tryLoadCookies(browser: Browser) {
  const { paths } = await getOptions();

  try {
    const cookies = JSON.parse(await fs.readFile(paths.cookies, "utf8"));
    for (const cookie of cookies) {
      if (cookie.name !== "ig_lang") await browser.setCookie(cookie);
    }
  } catch (err) {
    log("No cookies found", err);
  }
}

export async function trySaveCookies(browser: Browser) {
  const { paths } = await getOptions();

  try {
    log("Saving cookies");
    const cookies = await browser.cookies();

    await fs.writeFile(paths.cookies, JSON.stringify(cookies, null, 2));
  } catch (err) {
    log("Failed to save cookies", err);
  }
}

export async function tryDeleteCookies() {
  const { paths } = await getOptions();

  try {
    log("Deleting cookies");
    await fs.unlink(paths.cookies);
  } catch (err) {
    log("No cookies to delete", err);
  }
}
