import settings from "../../settings.json" with { type: "json" };
import { logger } from "./logger.ts";

export const options = {
  cookiesPath: settings.config.cookiesPath ?? "./cookies.json",

  username: settings.login.name ?? "",
  password: settings.login.password ?? "",

  enableCookies: true,
  randomizeUserAgent: true,

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
  shouldFollowUser: null as ((data: any) => boolean) | null,
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
  shouldLikeMedia:
    settings.config.shouldLikeMedia ??
    (null as ((data: any) => boolean) | null),

  // NOTE: The dontUnfollowUntilTimeElapsed option is ONLY for the unfollowNonMutualFollowers function
  // This specifies the time during which the bot should not touch users that it has previously followed (in milliseconds)
  // After this time has passed, it will be able to unfollow them again.
  // TODO should remove this option from here
  dontUnfollowUntilTimeElapsed: 3 * 24 * 60 * 60 * 1000,

  // Usernames that we should not touch, e.g. your friends and actual followings
  excludeUsers: [] as string[],

  // If true, will not do any actions (defaults to true)
  dryRun: settings.config.dryRun,

  logger,
};
