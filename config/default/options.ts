import { Options } from "src/util/types";

export const options: Omit<Options, "paths" | "password"> = {
  headless: false,
  username: "your_username",

  enableCookies: true,
  randomizeUserAgent: true,

  limits: {
    maxFollowsPerHour: "unlimited",
    maxFollowActionsPerDay: 50,
    maxLikesPerDay: 30,
  },
  skipPrivate: true,
  enableActions: {
    likeImages: false,
    follow: true,
    unfollowAny: true,
    unfollowNonMutual: true,
    muteUsers: false,
    takingScreenshots: false,
  },

  followUserFilters: {
    followRatioMin: 0.2,
    followRatioMax: 4.0,
    followWithMaxFollowers: null,
    followWithMaxFollowing: null,
    followWithMinFollowers: null,
    followWithMinFollowing: null,
    followFilterFn: null,
    likeMediaFilterFn: null,
  },

  unfollowAfterDays: {
    any: 7,
    nonMutual: 3,
  },

  usersToFollowFollowersOf: [""],
  excludeUsers: [""],
  dryRun: false,
};
