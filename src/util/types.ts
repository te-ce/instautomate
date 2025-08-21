import { z } from "zod";

export const OptionsSchema = z.object({
  headless: z.boolean().describe("Headless mode"),
  cookiesPath: z.string().describe("Path to the cookies file"),
  username: z.string().describe("Username"),
  password: z.string().describe("Password"),
  enableCookies: z.boolean().describe("Enable cookies"),
  randomizeUserAgent: z.boolean().describe("Randomize user agent"),
  skipPrivate: z.boolean().describe("Skip private accounts"),
  enableLikeImages: z.boolean().describe("Enable liking images"),
  muteUsers: z.boolean().describe("Mute users"),
  enableTakingScreenshots: z
    .boolean()
    .nullish()
    .describe("Enable taking screenshots"),
  maxFollowsPerHour: z
    .number()
    .min(0)
    .or(z.literal("unlimited"))
    .describe(
      "Global limit that prevents follow or unfollows (total) to exceed this number over a sliding window of one hour",
    ),
  maxFollowActionsPerDay: z
    .number()
    .min(0)
    .describe(
      "Global limit that prevents follow or unfollows (total) to exceed this number over a sliding window of one day:",
    ),
  maxLikesPerDay: z
    .number()
    .min(0)
    .describe(
      "Global limit that prevents likes to exceed this number over a sliding window of one day",
    ),
  followUserRatioMin: z
    .number()
    .nullable()
    .describe(
      "Don't follow users that have a followers / following ratio less than this",
    ),
  followUserRatioMax: z
    .number()
    .nullable()
    .describe(
      "Don't follow users that have a followers / following ratio higher than this",
    ),
  followUserWithMaxFollowers: z
    .number()
    .nullable()
    .describe("Don't follow users who have more followers than this"),
  followUserWithMaxFollowing: z
    .number()
    .nullable()
    .describe(
      "Don't follow users who have more people following them than this",
    ),
  followUserWithMinFollowers: z
    .number()
    .nullable()
    .describe("Don't follow users who have less followers than this"),
  followUserWithMinFollowing: z
    .number()
    .nullable()
    .describe(
      "Don't follow users who have less people following them than this",
    ),
  followUserFilterFn: z
    .function()
    .nullable()
    .describe("Custom logic filter for user follow"),
  likeMediaFilterFn: z
    .function()
    .nullable()
    .describe("Custom logic filter for media like"),
  usersToFollowFollowersOf: z
    .array(z.string())
    .describe("Usernames of the users to follow the followers of"),
  unfollowAfterDays: z
    .number()
    .describe(
      "Unfollow users that don't follow us back after this number of days",
    ),
  excludeUsers: z
    .array(z.string())
    .describe(
      "Usernames that we should not touch, e.g. your friends and actual followings",
    ),
  dryRun: z.boolean().describe("If true, will not do any actions"),
  followedDbPath: z.string().describe("Followed database path"),
  unfollowedDbPath: z.string().describe("Unfollowed database path"),
  likedPhotosDbPath: z.string().describe("Liked photos database path"),
  screenshotsPath: z.string().describe("Screenshots path"),
});

export type Options = z.infer<typeof OptionsSchema>;

export interface User {
  username: string;
  time: number;
  href?: string;
  failed?: boolean;
  noActionTaken?: boolean;
  id?: string;
  followerCount?: number;
  followsCount?: number;
  isPrivate?: boolean;
  isMuted?: boolean;
}

export type Media = {
  mediaType: string;
  mediaDesc: string;
  src: string;
  alt: string;
  poster: string;
};
