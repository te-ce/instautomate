import { Page } from "puppeteer";
import { join } from "path";
import { logger } from "../util/logger";
import { getOptions } from "../util/options";

export async function takeScreenshot(page: Page) {
  const { screenshotsPath } = await getOptions();

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
