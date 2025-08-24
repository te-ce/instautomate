import { z } from "zod";

export const OptionsSchema = z.object({
  headless: z.boolean().describe("Headless mode"),
  username: z.string().describe("Username"),
  password: z.string().describe("Password"),
  enableCookies: z.boolean().describe("Enable cookies"),
  randomizeUserAgent: z.boolean().describe("Randomize user agent"),

  skipPrivate: z.boolean().describe("Skip private accounts"),

  enableActions: z.object({
    likeImages: z.boolean().describe("Enable liking images"),
    follow: z.boolean().describe("Enable following users"),
    unfollowAny: z.boolean().describe("Enable unfollowing any user"),
    unfollowNonMutual: z
      .boolean()
      .describe("Enable unfollowing non-mutual followers"),
    muteUsers: z.boolean().describe("Mute users"),
    takingScreenshots: z
      .boolean()
      .nullish()
      .describe("Enable taking screenshots"),
  }),

  limits: z.object({
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
  }),

  followUserFilters: z.object({
    followRatioMin: z
      .number()
      .nullable()
      .describe(
        "Don't follow users that have a followers / following ratio less than this",
      ),
    followRatioMax: z
      .number()
      .nullable()
      .describe(
        "Don't follow users that have a followers / following ratio higher than this",
      ),
    followWithMaxFollowers: z
      .number()
      .nullable()
      .describe("Don't follow users who have more followers than this"),
    followWithMaxFollowing: z
      .number()
      .nullable()
      .describe(
        "Don't follow users who have more people following them than this",
      ),
    followWithMinFollowers: z
      .number()
      .nullable()
      .describe("Don't follow users who have less followers than this"),
    followWithMinFollowing: z
      .number()
      .nullable()
      .describe(
        "Don't follow users who have less people following them than this",
      ),
    followFilterFn: z
      .function()
      .nullable()
      .describe("Custom logic filter for user follow"),
    likeMediaFilterFn: z
      .function()
      .nullable()
      .describe("Custom logic filter for media like"),
  }),

  usersToFollowFollowersOf: z
    .array(z.string())
    .describe("Usernames of the users to follow the followers of"),
  excludeUsers: z
    .array(z.string())
    .describe(
      "Usernames that we should not touch, e.g. your friends and actual followings",
    ),
  unfollowAfterDays: z
    .object({
      any: z.number().min(0),
      nonMutual: z.number().min(0),
    })
    .describe(
      "Unfollow users that don't follow us back after this number of days",
    ),
  dryRun: z.boolean().describe("If true, will not do any actions"),
  paths: z.object({
    followed: z.string().describe("Followed database path"),
    unfollowed: z.string().describe("Unfollowed database path"),
    likedPhotos: z.string().describe("Liked photos database path"),
    screenshots: z.string().describe("Screenshots path"),
    cookies: z.string().describe("Path to the cookies file"),
  }),
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
