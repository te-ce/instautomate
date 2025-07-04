import { Page } from "puppeteer";
import { join } from "path";
import { logger } from "../util/logger";
import { getOptions } from "../util/options";
import fs from "fs";

export async function takeScreenshot(page: Page) {
  const { screenshotsPath, enableTakingScreenshots } = await getOptions();

  if (!enableTakingScreenshots) {
    return;
  }

  try {
    const fileName = `${new Date().toString()}.jpg`;

    const screenshotDirectory = join(screenshotsPath, fileName);
    if (!fs.existsSync(screenshotDirectory)) {
      logger.log(
        "Screenshot does not exist, creating directory",
        screenshotDirectory,
      );
      fs.mkdirSync(screenshotDirectory, { recursive: true });
    }

    logger.log("Taking screenshot", fileName);
    await page.screenshot({
      path: join(screenshotsPath, fileName).toString() as `${string}.jpeg`,
      type: "jpeg",
      quality: 30,
    });
  } catch (err) {
    logger.error("Failed to take screenshot", err);
  }
}
