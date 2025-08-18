import { Options } from "src/util/types";

export const options: Omit<
  Options,
  | "cookiesPath"
  | "followedDbPath"
  | "unfollowedDbPath"
  | "likedPhotosDbPath"
  | "screenshotsPath"
  | "password"
> = {
  headless: false,
  username: "your_username",

  enableCookies: true,
  randomizeUserAgent: true,

  maxFollowsPerHour: 10,
  maxFollowActionsPerDay: 50,
  maxLikesPerDay: 30,
  skipPrivate: true,
  enableLikeImages: false,
  muteUsers: false,

  followUserRatioMin: 0.2,
  followUserRatioMax: 4.0,
  followUserWithMinFollowing: null,
  followUserWithMaxFollowing: null,
  followUserWithMaxFollowers: null,
  followUserWithMinFollowers: null,

  followUserFilterFn: null,
  likeMediaFilterFn: null,

  unfollowAfterDays: 7,
  dontUnfollowUntilTimeElapsed: 3 * 24 * 60 * 60 * 1000,

  usersToFollowFollowersOf: [""],
  excludeUsers: [""],
  dryRun: false,
};
