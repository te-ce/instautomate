import fs from "fs-extra";
import { Browser } from "puppeteer";
import settings from "../../settings.json" with { type: "json" };
import { logger } from "src/util/logger";

export const Cookies = (browser: Browser) => {
  const { cookiesPath } = settings.config;

  async function tryLoadCookies() {
    try {
      const cookies = JSON.parse(await fs.readFile(cookiesPath, "utf8"));
      for (const cookie of cookies) {
        if (cookie.name !== "ig_lang") await browser.setCookie(cookie);
      }
    } catch (err) {
      logger.error("No cookies found", err);
    }
  }

  async function trySaveCookies() {
    try {
      logger.log("Saving cookies");
      const cookies = await browser.cookies();

      await fs.writeFile(cookiesPath, JSON.stringify(cookies, null, 2));
    } catch (err) {
      logger.error("Failed to save cookies", err);
    }
  }

  async function tryDeleteCookies() {
    try {
      logger.log("Deleting cookies");
      await fs.unlink(cookiesPath);
    } catch (err) {
      logger.error("No cookies to delete", err);
    }
  }
  return {
    tryLoadCookies,
    trySaveCookies,
    tryDeleteCookies,
  };
};
