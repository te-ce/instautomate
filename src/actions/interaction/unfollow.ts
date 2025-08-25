import assert from "assert";
import { colorName, logger } from "src/util/logger";
import { navigateToUser } from "../navigation";
import { getJsonDb } from "src/db/db";
import { Page } from "puppeteer";
import { sleep } from "src/util/util";
import { throttle } from "../limit";
import {
  findFollowButton,
  findUnfollowButton,
  findUnfollowConfirmButton,
} from "../locator";
import { User } from "src/util/types";
import { getOptions } from "src/util/options";
import {
  checkActionBlocked,
  haveRecentlyFollowedUser,
  doesUserFollowMe,
} from "src/util/status";
import {
  getFollowersOrFollowingGenerator,
  navigateToUserAndGetData,
} from "../data";
import { DAY_IN_MS } from "src/util/const";
import { toggleMuteUser } from "./toggleSilent";

export async function unfollowAllUnknown({
  limit,
  myUserId,
  page,
  userDataCache,
}: {
  limit: number;
  myUserId: string;
  page: Page;
  userDataCache: Record<string, User>;
}) {
  const db = await getJsonDb();
  const { excludeUsers } = await getOptions();
  logger.log("Unfollowing all except excludes and auto followed");

  const unfollowUsersGenerator = getFollowersOrFollowingGenerator({
    userId: myUserId,
    getFollowers: false,
    page,
  });

  async function condition(username: string) {
    if (db.prevFollowedUsers[username]) return false; // we followed this user, so it's not unknown
    if (excludeUsers.includes(username)) return false; // User is excluded by exclude list
    return true;
  }

  return safelyUnfollowUserListGenerator({
    usersToUnfollow: unfollowUsersGenerator,
    limit,
    condition,
    page,
    userDataCache,
  });
}

export async function unfollowNonMutualFollowers({
  limit,
  page,
  userDataCache,
}: {
  limit: number;
  page: Page;
  userDataCache: Record<string, User>;
}) {
  const { excludeUsers, unfollowAfterDays } = await getOptions();
  const db = await getJsonDb();
  const usersToUnfollow = await getUsersToUnfollowSince(
    unfollowAfterDays.nonMutual,
  );

  logger.log(`Unfollowing non-mutual followers (limit ${limit})...`);

  async function condition(username: string) {
    if (excludeUsers.includes(username)) return false; // User is excluded by exclude list
    if (await haveRecentlyFollowedUser(username)) {
      logger.log(
        `Have recently followed user ${colorName(username)}, skipping`,
      );
      return false;
    }

    if (db.prevFollowedUsers[username]?.followsMe) {
      logger.log(`User ${colorName(username)} follows us, skipping`);
      return false;
    }

    const followsMe = await doesUserFollowMe({
      page,
      username,
    });
    return !followsMe;
  }

  return safelyUnfollowUsers({
    usersToUnfollow,
    limit,
    condition,
    page,
    userDataCache,
  });
}

export async function unfollowAnyFollowed({
  limit,
  page,
  userDataCache,
}: {
  limit: number;
  page: Page;
  userDataCache: Record<string, User>;
}) {
  const db = await getJsonDb();
  const { unfollowAfterDays } = await getOptions();
  assert(unfollowAfterDays.any >= 0);
  const { excludeUsers } = await getOptions();

  logger.log(
    `Unfollowing currently followed users who were auto-followed more than ${unfollowAfterDays.any} days ago (limit ${limit})...`,
  );

  const usersToUnfollow = await getUsersToUnfollowSince(unfollowAfterDays.any);

  async function condition(username: string) {
    return (
      db.prevFollowedUsers[username] &&
      !excludeUsers.includes(username) &&
      (new Date().getTime() - db.prevFollowedUsers[username].time) / DAY_IN_MS >
        unfollowAfterDays.any
    );
  }

  return safelyUnfollowUsers({
    usersToUnfollow,
    limit,
    condition,
    page,
    userDataCache,
  });
}

export async function safelyUnfollowUserListGenerator({
  usersToUnfollow,
  limit,
  condition,
  page,
  userDataCache,
}: {
  usersToUnfollow: AsyncGenerator<any[], string[], unknown>;
  limit: number;
  condition: (username: string) => Promise<boolean>;
  page: Page;
  userDataCache: Record<string, User>;
}) {
  let count = 0;
  for await (const listOrUsername of usersToUnfollow) {
    // backward compatible:
    const list = Array.isArray(listOrUsername)
      ? listOrUsername
      : [listOrUsername];

    count += await safelyUnfollowUsers({
      usersToUnfollow: list,
      limit,
      condition,
      page,
      userDataCache,
    });
  }

  return count;
}

export async function safelyUnfollowUsers({
  usersToUnfollow,
  limit,
  condition,
  page,
  userDataCache,
}: {
  usersToUnfollow: string[];
  limit: number;
  condition: (username: string) => Promise<boolean>;
  page: Page;
  userDataCache: Record<string, User>;
}) {
  const db = await getJsonDb();
  logger.log("Unfollowing users, up to limit", limit);

  let peopleProcessed = 0;
  let peopleUnfollowed = 0;

  for (const username of usersToUnfollow) {
    if (await condition(username)) {
      try {
        const userFound = await navigateToUser(page, username);

        if (!userFound) {
          // to avoid repeatedly unfollowing failed users, flag them as already unfollowed
          logger.log(` ${colorName(username)} not found for unfollow`);
          await db.addPrevUnfollowedUser({
            username,
            time: new Date().getTime(),
            noActionTaken: true,
          });
          await sleep({ seconds: 3, silent: true });
        } else {
          const { noActionTaken } = await unfollowUser({
            username,
            page,
            userDataCache,
          });

          if (noActionTaken) {
            await sleep({ seconds: 5, silent: true });
          } else {
            await sleep({ seconds: 10 });
            peopleUnfollowed += 1;

            if (peopleUnfollowed % 10 === 0) {
              logger.log("Have unfollowed 10 users since last break, pausing");
              await sleep({ minutes: 3 });
            }
          }
        }

        peopleProcessed += 1;
        logger.log(
          `Have now unfollowed (or tried to unfollow) ${peopleProcessed} users`,
        );

        if (limit && peopleUnfollowed >= limit) {
          logger.log(`Have unfollowed limit of ${limit}, stopping`);
          return peopleUnfollowed;
        }

        await throttle();
      } catch (err) {
        logger.error(
          `Failed to unfollow ${colorName(username)}, continuing with next`,
          err,
        );
      }
    }
  }

  logger.log("Done with unfollowing", peopleProcessed, peopleUnfollowed);

  return peopleUnfollowed;
}

// See https://github.com/timgrossmann/InstaPy/pull/2345
// https://github.com/timgrossmann/InstaPy/issues/2355
export async function unfollowUser({
  username,
  page,
  userDataCache,
}: {
  username: string;
  page: Page;
  userDataCache: Record<string, User>;
}) {
  const db = await getJsonDb();
  const { dryRun } = await getOptions();

  await navigateToUserAndGetData({ username, page, userDataCache });
  logger.log(`Unfollowing user ${colorName(username)}...`);

  const res: User = { username, time: new Date().getTime() };

  const unfollowButton = await findUnfollowButton(page);
  if (!unfollowButton) {
    const followButton = await findFollowButton(page);
    if (followButton) {
      logger.log(`User ${colorName(username)} has been unfollowed already`);
      res.noActionTaken = true;
    } else {
      logger.log(`Failed to find unfollow button for ${colorName(username)}`);
      res.noActionTaken = true;
    }
  }

  if (!dryRun) {
    if (unfollowButton) {
      await toggleMuteUser(page, username, false);
      await unfollowButton.click();
      await sleep({ seconds: 2, silent: true });
      const confirmHandle = await findUnfollowConfirmButton(page);
      if (confirmHandle) await confirmHandle.click();

      await sleep({ seconds: 5, silent: true });

      await checkActionBlocked(page);

      const elementHandle2 = await findFollowButton(page);
      if (!elementHandle2) {
        throw new Error(
          `Unfollow button did not change state for ${colorName(username)}`,
        );
      } else {
        logger.log(`Unfollowed user ${colorName(username)}`);
      }
    }

    await db.addPrevUnfollowedUser(res);
    db.actions.unfollow++;
  }

  await sleep({ seconds: 15 });

  return res;
}

export async function getUsersToUnfollowSince(daysPassed: number) {
  const db = await getJsonDb();
  const { excludeUsers } = await getOptions();
  const timeNowInMs = new Date().getTime();
  const users = db.prevFollowedUsers;

  return Object.keys(users).filter((username) => {
    const user = users[username];

    if (excludeUsers.includes(username)) return false;
    if (user.noActionTaken) return false;
    if (user.failed) return false;
    if (db.prevUnfollowedUsers[username]) return false;

    const daysSinceUnfollowed = Math.floor(
      (timeNowInMs - user.time) / DAY_IN_MS,
    );

    return daysSinceUnfollowed >= daysPassed;
  });
}
