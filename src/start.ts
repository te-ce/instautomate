import settings from "../settings.json" with { type: "json" };
import puppeteer from "puppeteer";

import { Instauto } from "./bot.ts";

// Optional: Custom logger with timestamps
const log = (fn, ...args) => console[fn](new Date().toISOString(), ...args);
const logger = Object.fromEntries(
  ["log", "info", "debug", "error", "trace", "warn"].map((fn) => [
    fn,
    (...args) => log(fn, ...args),
  ]),
);

const options = {
  cookiesPath: "./cookies.json",

  username: settings.login.name ?? "",
  password: settings.login.password ?? "",

  // Global limit that prevents follow or unfollows (total) to exceed this number over a sliding window of one hour:
  maxFollowsPerHour: settings.config.maxFollowsPerHour ?? 20,
  // Global limit that prevents follow or unfollows (total) to exceed this number over a sliding window of one day:
  maxFollowsPerDay: settings.config.maxFollowsPerHour ?? 150,
  // (NOTE setting the above parameters too high will cause temp ban/throttle)

  maxLikesPerDay: settings.config.maxLikesPerDay ?? 30,

  // Don't follow users that have a followers / following ratio less than this:
  followUserRatioMin:
    process.env.FOLLOW_USER_RATIO_MIN != null
      ? parseFloat(process.env.FOLLOW_USER_RATIO_MIN)
      : 0.2,
  // Don't follow users that have a followers / following ratio higher than this:
  followUserRatioMax:
    process.env.FOLLOW_USER_RATIO_MAX != null
      ? parseFloat(process.env.FOLLOW_USER_RATIO_MAX)
      : 4.0,
  // Don't follow users who have more followers than this:
  followUserMaxFollowers: null,
  // Don't follow users who have more people following them than this:
  followUserMaxFollowing: null,
  // Don't follow users who have less followers than this:
  followUserMinFollowers: settings.config.followUserMinFollowers ?? null,
  // Don't follow users who have more people following them than this:
  followUserMinFollowing: null,

  // Custom logic filter for user follow
  shouldFollowUser: null,
  /* Example to skip bussiness accounts
  shouldFollowUser: function (data) {
    console.log('isBusinessAccount:', data.isBusinessAccount);
    return !data.isBusinessAccount;
  }, */
  /* Example to skip accounts with 'crypto' & 'bitcoin' in their bio or username
  shouldFollowUser: function (data) {
    console.log('username:', data.username, 'biography:', data.biography);
    var keywords = ['crypto', 'bitcoin'];
    if (keywords.find(v => data.username.includes(v)) !== undefined || keywords.find(v => data.biography.includes(v)) !== undefined) {
      return false;
    }
    return true;
  }, */

  // Custom logic filter for liking media
  shouldLikeMedia: settings.config.shouldLikeMedia ?? null,

  // NOTE: The dontUnfollowUntilTimeElapsed option is ONLY for the unfollowNonMutualFollowers function
  // This specifies the time during which the bot should not touch users that it has previously followed (in milliseconds)
  // After this time has passed, it will be able to unfollow them again.
  // TODO should remove this option from here
  dontUnfollowUntilTimeElapsed: 3 * 24 * 60 * 60 * 1000,

  // Usernames that we should not touch, e.g. your friends and actual followings
  excludeUsers: [],

  // If true, will not do any actions (defaults to true)
  dryRun: settings.config.dryRun,

  logger,
};

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
