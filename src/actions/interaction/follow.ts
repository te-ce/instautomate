import { colorName, log } from "src/util/logger";
import { getJsonDb } from "src/db/db";
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
  userDataCache,
}: {
  username: string;
  skipPrivate: boolean;
  page: Page;
  userDataCache: Record<string, User>;
}) {
  const db = await getJsonDb();
  const { followUserFilters } = await getOptions();
  const {
    followRatioMin,
    followRatioMax,
    followWithMinFollowers,
    followWithMinFollowing,
    followWithMaxFollowers,
    followWithMaxFollowing,
    followFilterFn,
  } = followUserFilters;

  const prevFollowedUser = db.prevFollowedUsers[username];
  const prevUnfollowedUser = db.prevUnfollowedUsers[username];
  if (prevFollowedUser || prevUnfollowedUser) {
    log("Skipping previously followed user", username);
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
    log(`User ${colorName(username)} is private, skipping`);
    return false;
  }
  if (
    (followWithMaxFollowers != null &&
      followerCount > followWithMaxFollowers) ||
    (followWithMaxFollowing != null && followsCount > followWithMaxFollowing) ||
    (followWithMinFollowers != null &&
      followerCount < followWithMinFollowers) ||
    (followWithMinFollowing != null && followsCount < followWithMinFollowing)
  ) {
    log(
      `User ${colorName(username)} has too many or too few followers or following, skipping.`,
      "followedByCount:",
      followerCount,
      "followsCount:",
      followsCount,
    );
    return false;
  }
  if (
    (followRatioMax != null && ratio > followRatioMax) ||
    (followRatioMin != null && ratio < followRatioMin)
  ) {
    log(
      `User ${colorName(username)} has too many followers compared to follows or opposite, skipping`,
    );
    return false;
  }
  if (
    followFilterFn !== null &&
    typeof followFilterFn === "function" &&
    !followFilterFn({
      username,
    }) === true
  ) {
    log(
      `Custom follow logic returned false for ${colorName(username)}, skipping`,
    );
    return false;
  }

  await followUser({ username, page, userDataCache });

  await sleep({ seconds: 15 });
  await throttle();

  return true;
}

export async function safelyFollowUserList({
  users,
  skipPrivate,
  limit,
  page,
  userDataCache,
}: {
  users: string[];
  skipPrivate: boolean;
  limit: number;
  page: Page;
  userDataCache: Record<string, User>;
}) {
  log("Following users, up to limit", limit);

  for (const username of users) {
    await throttle();

    try {
      await followUserRespectingRestrictions({
        username,
        skipPrivate,
        page,
        userDataCache,
      });
    } catch (err) {
      log(`Failed to follow user ${colorName(username)}, continuing`, err);
      await takeScreenshot(page);
      await sleep({ seconds: 20 });
    }
  }
}

export async function followUser({
  username,
  page,
  userDataCache,
}: {
  username: string;
  page: Page;
  userDataCache: Record<string, User>;
}) {
  const { dryRun, enableActions } = await getOptions();
  const db = await getJsonDb();

  await navigateToUserAndGetData({ username, page, userDataCache });
  const unfollowButton = await findUnfollowButton(page);

  if (unfollowButton) {
    log(`We are already following ${colorName(username)}, skipping`);
    await sleep({ seconds: 5 });
    return;
  }

  const followButton = await findFollowButton(page);

  if (!followButton) {
    throw new Error(`Follow button not found for ${colorName(username)}`);
  }

  log.temp(`Following user ${colorName(username)}...`);

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
      isMuted: enableActions.muteUsers,
    };
    if (!unfollowButton) entry.failed = true;

    if (enableActions.muteUsers) {
      await toggleMuteUser(page, username, true);
    }

    await db.addPrevFollowedUser(entry);
    db.actions.follow++;
    log(`Followed user ${colorName(username)}.`);

    if (!unfollowButton) {
      log(
        `Button did not change state for ${colorName(username)} - Sleeping 1 min`,
      );
      await sleep({ seconds: 60 });
      throw new Error(`Button did not change state for ${colorName(username)}`);
    }
  }

  await sleep({ seconds: 1, silent: true });
}
