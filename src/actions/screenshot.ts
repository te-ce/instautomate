import { Page } from "puppeteer";
import { logger } from "src/util/logger";
import { join } from "path";
import settings from "../../settings.json" with { type: "json" };

export async function takeScreenshot(page: Page) {
  const { screenshotsPath } = settings.config;

  try {
    const fileName = `${new Date().getTime()}.jpg`;
    logger.log("Taking screenshot", fileName);
    await page.screenshot({
      path: join(screenshotsPath, fileName) as `${string}.jpeg`,
      type: "jpeg",
      quality: 30,
    });
  } catch (err) {
    logger.error("Failed to take screenshot", err);
  }
}
