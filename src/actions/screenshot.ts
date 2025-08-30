import { Page } from "puppeteer";
import { join } from "path";
import { log } from "../util/logger";
import { getOptions } from "../util/options";
import fs from "fs";

export async function takeScreenshot(page: Page) {
  const { paths, enableActions } = await getOptions();

  if (!enableActions.takingScreenshots) {
    return;
  }

  try {
    const fileName = `${new Date().toString()}.jpg`;

    const screenshotDirectory = join(paths.screenshots, fileName);
    if (!fs.existsSync(screenshotDirectory)) {
      log("Screenshot does not exist, creating directory", screenshotDirectory);
      fs.mkdirSync(screenshotDirectory, { recursive: true });
    }

    log("Taking screenshot", fileName);
    await page.screenshot({
      path: join(paths.screenshots, fileName).toString() as `${string}.jpeg`,
      type: "jpeg",
      quality: 30,
    });
  } catch (err) {
    log("Failed to take screenshot", err);
  }
}
