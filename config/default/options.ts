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

  maxFollowsPerHour: "unlimited",
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

  usersToFollowFollowersOf: [""],
  excludeUsers: [""],
  dryRun: false,
};
