import settings from "../settings.json" with { type: "json" };
import puppeteer from "puppeteer";

import { Instauto } from "./bot.ts";
import { options } from "./util/options.ts";

(async () => {
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: process.env.IS_RUNNING_ON_DOCKER
        ? "/usr/bin/chromium"
        : undefined,
      headless: settings.config.headless,

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
    const instautoDb = await Instauto.JSONDB({
      // Will store a list of all users that have been followed before, to prevent future re-following.
      followedDbPath: "./followed.json",
      // Will store all unfollowed users here
      unfollowedDbPath: "./unfollowed.json",
      // Will store all likes here
      likedPhotosDbPath: "./liked-photos.json",
    });

    const instauto = await Instauto(instautoDb, browser, options);

    // This can be used to unfollow people:
    // Will unfollow auto-followed AND manually followed accounts who are not following us back, after some time has passed
    // The time is specified by config option dontUnfollowUntilTimeElapsed
    // await instauto.unfollowNonMutualFollowers();
    // await instauto.sleep(10 * 60 * 1000);

    // Unfollow previously auto-followed users (regardless of whether or not they are following us back)
    // after a certain amount of days (2 weeks)
    // Leave room to do following after this too (unfollow 2/3 of maxFollowsPerDay)
    const unfollowedCount = await instauto.unfollowOldFollowed({
      ageInDays: settings.config.unfollowAfterDays ?? 14,
      limit: options.maxFollowsPerDay * (4 / 3),
    });

    if (unfollowedCount > 0) await instauto.sleep(10 * 60 * 1000);

    // List of usernames that we should follow the followers of, can be celebrities etc.
    const usersToFollowFollowersOf = settings.usersToFollowFollowersOf ?? [];

    // Now go through each of these and follow a certain amount of their followers
    await instauto.followUsersFollowers({
      usersToFollowFollowersOf,
      maxFollowsTotal: options.maxFollowsPerDay - unfollowedCount,
      skipPrivate: settings.config.skipPrivate ?? true,
      enableLikeImages: settings.config.enableLikeImages ?? false,
      likeImagesMax: settings.config.likeImagesMax ?? 3,
    });

    await instauto.sleep(10 * 60 * 1000);

    console.log("Done running");

    await instauto.sleep(30000);
  } catch (err) {
    console.error(err);
  } finally {
    console.log("Closing browser");
    if (browser) await browser.close();
  }
})();
