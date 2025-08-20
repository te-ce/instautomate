import puppeteer from "puppeteer";

import { Instauto } from "./bot.ts";
import { getOptions } from "./util/options.ts";
import { sleep } from "./util/util.ts";
import { logger } from "./util/logger.ts";

(async () => {
  let browser;

  const options = await getOptions();

  try {
    browser = await puppeteer.launch({
      executablePath: process.env.IS_RUNNING_ON_DOCKER
        ? "/usr/bin/chromium"
        : undefined,
      headless: options.headless,

      args: [
        // Needed for docker
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        // commented out to fix 'Navigating frame was detached' bug
        // see: https://github.com/puppeteer/puppeteer/issues/11515#issuecomment-2364155101
        // '--single-process',
        "--disable-gpu",

        // If you need to proxy: (see also https://www.chromium.org/developers/design-documents/network-settings)
        // '--proxy-server=127.0.0.1:9876',
      ],
    });

    // Create a database where state will be loaded/saved to
    const instautoDb = await Instauto.jsonDb();

    const instauto = await Instauto(instautoDb, browser);

    // This can be used to unfollow people:
    // Will unfollow auto-followed AND manually followed accounts who are not following us back, after some time has passed
    // The time is specified by config option dontUnfollowUntilTimeElapsed
    // await instauto.unfollowNonMutualFollowers();
    // await instauto.sleepSeconds(10 * 60);

    // Unfollow previously auto-followed users (regardless of whether or not they are following us back)
    // after a certain amount of days (2 weeks)
    // Leave room to do following after this too (unfollow 2/3 of maxFollowsPerDay)
    const MIN_UNFOLLOW_COUNT = 10;
    const unfollowedCount = await instauto.unfollowOldFollowed({
      ageInDays: options.unfollowAfterDays,
      limit:
        MIN_UNFOLLOW_COUNT +
        Math.floor(options.maxFollowActionsPerDay * (2 / 3)),
      page: instauto.getPage(),
      db: instautoDb,
      userDataCache: instauto.userDataCache,
    });

    if (unfollowedCount > 0) await sleep({ minutes: 10 });

    // Now go through each of these and follow a certain amount of their followers
    await instauto.followUsersFollowers({
      usersToFollowFollowersOf: options.usersToFollowFollowersOf,
      maxFollowsTotal: options.maxFollowActionsPerDay - unfollowedCount,
      skipPrivate: options.skipPrivate,
      enableLikeImages: options.enableLikeImages,
      likeImagesMax: options.maxLikesPerDay,
      page: instauto.getPage(),
      db: instautoDb,
      userDataCache: instauto.userDataCache,
    });

    logger.log("Finalizing...");
  } catch (err) {
    logger.error(err);
  } finally {
    logger.log("Closing browser");
    if (browser) await browser.close();

    logger.log("");
    logger.log("");
    logger.log("__FINISHED__");
    logger.log(`Current day: ${new Date().toLocaleDateString()}`);
    logger.log(`Current time: ${new Date().toLocaleTimeString()}`);
    logger.log(`Username: ${options.username}`);
    logger.log("____");
    logger.log("");
    logger.log("");
  }
})();
