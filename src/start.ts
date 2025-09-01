import { Instauto } from "./bot.ts";
import { log, logFinish } from "./util/logger";
import { setupBrowser } from "./actions/init.ts";
import { run } from "./actions/run.ts";

(async () => {
  let browser;
  try {
    browser = await setupBrowser();

    // Create a database where state will be loaded/saved to
    const instauto = await Instauto(browser);

    await run(instauto);
  } catch (err) {
    log(err);
  } finally {
    log("Closing browser");
    await logFinish();
    if (browser) await browser.close();
  }
})();
