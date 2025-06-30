import { ElementHandle, Page } from "puppeteer";
import { INSTAGRAM_URL } from "src/util/const";
import { logger } from "src/util/logger";
import { sleep } from "src/util/util";

export const Navigation = (page: Page) => {
  async function tryPressButton(
    elementHandles: ElementHandle[],
    name: string,
    sleepMs = 3000,
  ) {
    try {
      if (elementHandles.length === 1) {
        logger.log(`Pressing button: ${name}`);
        elementHandles[0].click();
        await sleep(sleepMs);
      }
    } catch (err) {
      logger.warn(`Failed to press button: ${name}`, err);
    }
  }

  const goHome = async () => gotoUrl(`${INSTAGRAM_URL}/?hl=en`);

  // See https://github.com/mifi/SimpleInstaBot/issues/140#issuecomment-1149105387
  const gotoUrl = async (url: string) =>
    page.goto(url, {
      waitUntil: ["load", "domcontentloaded", "networkidle2"],
    });

  async function gotoWithRetry(url: string) {
    const maxAttempts = 3;
    for (let attempt = 0; ; attempt += 1) {
      logger.log(`Goto ${url}`);
      const response = await gotoUrl(url);
      const status = response?.status();
      logger.log("Page loaded");
      await sleep(2000);

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
      await sleep((attempt + 1) * 30 * 60 * 1000);
    }
  }

  return {
    tryPressButton,
    gotoWithRetry,
    gotoUrl,
    goHome,
  };
};
