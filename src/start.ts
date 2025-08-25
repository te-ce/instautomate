import { Instauto } from "./bot.ts";
import { logger, logFinish } from "./util/logger.ts";
import { setupBrowser } from "./actions/startup.ts";
import { runActions } from "./actions/runActions.ts";

(async () => {
  let browser;
  try {
    browser = await setupBrowser();

    // Create a database where state will be loaded/saved to
    const instauto = await Instauto(browser);

    await runActions(instauto);
  } catch (err) {
    logger.error(err);
  } finally {
    logger.log("Closing browser");
    await logFinish();
    if (browser) await browser.close();
  }
})();
