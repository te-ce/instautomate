import { logger } from "src/util/logger";
import { JsonDB } from "src/db/db";
import { Page } from "puppeteer";
import { checkActionBlocked, isUserPrivate } from "src/util/status";
import { getOptions } from "src/util/options";
import { sleep } from "src/util/util";
import { throttle } from "../limit";
import { takeScreenshot } from "../screenshot";
import { findFollowButton, findUnfollowButton } from "../locator";
import { User } from "src/util/types";
import { navigateToUserAndGetData } from "../data";
import { toggleMuteUser } from "./toggleSilent";

export async function followUserRespectingRestrictions({
  username,
  skipPrivate = false,
  page,
  db,
  userDataCache,
}: {
  username: string;
  skipPrivate: boolean;
  page: Page;
  db: JsonDB;
  userDataCache: Record<string, User>;
}) {
  const {
    followUserWithMaxFollowers,
    followUserWithMaxFollowing,
    followUserWithMinFollowers,
    followUserWithMinFollowing,
    followUserRatioMax,
    followUserRatioMin,
    followUserFilterFn,
  } = await getOptions();
  if (db.prevFollowedUsers[username] || db.prevUnfollowedUsers[username]) {
    logger.log("Skipping already followed user", username);

    await db.addPrevUnfollowedUser({
      username,
      time: new Date().getTime(),
      href: "",
    });
    return false;
  }

  const graphqlUser = await navigateToUserAndGetData({
    username,
    page,
    userDataCache,
  });

  const {
    followerCount = 0,
    followsCount = 0,
    isPrivate = false,
  } = graphqlUser;

  const isPrivate2 = await isUserPrivate(page);

  const ratio = followerCount / (followsCount || 1);

  if (isPrivate || (isPrivate2 && skipPrivate)) {
    logger.log("User is private, skipping");
    return false;
  }
  if (
    (followUserWithMaxFollowers != null &&
      followerCount > followUserWithMaxFollowers) ||
    (followUserWithMaxFollowing != null &&
      followsCount > followUserWithMaxFollowing) ||
    (followUserWithMinFollowers != null &&
      followerCount < followUserWithMinFollowers) ||
    (followUserWithMinFollowing != null &&
      followsCount < followUserWithMinFollowing)
  ) {
    logger.log(
      "User has too many or too few followers or following, skipping.",
      "followedByCount:",
      followerCount,
      "followsCount:",
      followsCount,
    );
    return false;
  }
  if (
    (followUserRatioMax != null && ratio > followUserRatioMax) ||
    (followUserRatioMin != null && ratio < followUserRatioMin)
  ) {
    logger.log(
      "User has too many followers compared to follows or opposite, skipping",
    );
    return false;
  }
  if (
    followUserFilterFn !== null &&
    typeof followUserFilterFn === "function" &&
    !followUserFilterFn({
      username,
    }) === true
  ) {
    logger.log(`Custom follow logic returned false for ${username}, skipping`);
    return false;
  }

  await followUser({ username, page, userDataCache, db });

  await sleep({ seconds: 15 });
  await throttle(db);

  return true;
}

export async function safelyFollowUserList({
  users,
  skipPrivate,
  limit,
  page,
  db,
  userDataCache,
}: {
  users: string[];
  skipPrivate: boolean;
  limit: number;
  page: Page;
  db: JsonDB;
  userDataCache: Record<string, User>;
}) {
  logger.log("Following users, up to limit", limit);

  for (const username of users) {
    await throttle(db);

    try {
      await followUserRespectingRestrictions({
        username,
        skipPrivate,
        page,
        db,
        userDataCache,
      });
    } catch (err) {
      logger.error(`Failed to follow user ${username}, continuing`, err);
      await takeScreenshot(page);
      await sleep({ seconds: 20 });
    }
  }
}

export async function followUser({
  username,
  page,
  userDataCache,
  db,
}: {
  username: string;
  page: Page;
  userDataCache: Record<string, User>;
  db: JsonDB;
}) {
  const { dryRun, muteUsers } = await getOptions();
  await navigateToUserAndGetData({ username, page, userDataCache });
  const unfollowButton = await findUnfollowButton(page);

  if (unfollowButton) {
    logger.log("We are already following this user");
    await sleep({ seconds: 5 });
    return;
  }

  const followButton = await findFollowButton(page);

  if (!followButton) {
    throw new Error("Follow button not found");
  }

  logger.log(`Following user ${username}`);

  if (!dryRun) {
    await followButton.click();
    await sleep({ seconds: 10 });

    await checkActionBlocked(page);

    const unfollowButton = await findUnfollowButton(page);

    // Don't want to retry this user over and over in case there is an issue https://github.com/mifi/instauto/issues/33#issuecomment-723217177
    const entry: User = {
      username,
      time: new Date().getTime(),
      href: "",
      isMuted: muteUsers,
    };
    if (!unfollowButton) entry.failed = true;

    if (muteUsers) {
      await toggleMuteUser(page, username, true);
    }

    await db.addPrevFollowedUser(entry);

    if (!unfollowButton) {
      logger.log("Button did not change state - Sleeping 1 min");
      await sleep({ seconds: 60 });
      throw new Error("Button did not change state");
    }
  }

  await sleep({ seconds: 1, silent: true });
}
