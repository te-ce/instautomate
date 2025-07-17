import assert from "assert";
import { logger } from "src/util/logger";
import { navigateToUser } from "../navigation";
import { JsonDB } from "src/db/db";
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
import { DAY_IN_MS, MIN_IN_S } from "src/util/const";

export async function unfollowAllUnknown({
  limit,
  myUserId,
  page,
  db,
  userDataCache,
}: {
  limit: number;
  myUserId: string;
  page: Page;
  db: JsonDB;
  userDataCache: Record<string, User>;
}) {
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
    db,
    userDataCache,
  });
}

export async function unfollowOldFollowed({
  ageInDays,
  limit,
  page,
  db,
  userDataCache,
}: {
  ageInDays: number;
  limit: number;
  page: Page;
  db: JsonDB;
  userDataCache: Record<string, User>;
}) {
  assert(ageInDays >= 0);
  const { excludeUsers } = await getOptions();

  logger.log(
    `Unfollowing currently followed users who were auto-followed more than ${ageInDays} days ago (limit ${limit})...`,
  );

  const usersToUnfollow = await getUsersToUnfollowSince(db, ageInDays);

  async function condition(username: string) {
    return (
      db.prevFollowedUsers[username] &&
      !excludeUsers.includes(username) &&
      (new Date().getTime() - db.prevFollowedUsers[username].time) /
        (1000 * 60 * 60 * 24) >
        ageInDays
    );
  }

  return safelyUnfollowUsers({
    usersToUnfollow,
    limit,
    condition,
    page,
    db,
    userDataCache,
  });
}

export async function safelyUnfollowUserListGenerator({
  usersToUnfollow,
  limit,
  condition,
  page,
  db,
  userDataCache,
}: {
  usersToUnfollow: AsyncGenerator<any[], string[], unknown>;
  limit: number;
  condition: (username: string) => Promise<boolean>;
  page: Page;
  db: JsonDB;
  userDataCache: Record<string, User>;
}) {
  for await (const listOrUsername of usersToUnfollow) {
    // backward compatible:
    const list = Array.isArray(listOrUsername)
      ? listOrUsername
      : [listOrUsername];

    await safelyUnfollowUsers({
      usersToUnfollow: list,
      limit,
      condition,
      page,
      db,
      userDataCache,
    });
  }
}

export async function safelyUnfollowUsers({
  usersToUnfollow,
  limit,
  condition,
  page,
  db,
  userDataCache,
}: {
  usersToUnfollow: string[];
  limit: number;
  condition: (username: string) => Promise<boolean>;
  page: Page;
  db: JsonDB;
  userDataCache: Record<string, User>;
}) {
  logger.log("Unfollowing users, up to limit", limit);

  let peopleProcessed = 0;
  let peopleUnfollowed = 0;

  for (const username of usersToUnfollow) {
    if (await condition(username)) {
      try {
        const userFound = await navigateToUser(page, username);

        if (!userFound) {
          // to avoid repeatedly unfollowing failed users, flag them as already unfollowed
          logger.log("User not found for unfollow");
          await db.addPrevUnfollowedUser({
            username,
            time: new Date().getTime(),
            noActionTaken: true,
          });
          await sleep({ seconds: 3 });
        } else {
          const { noActionTaken } = await unfollowUser({
            username,
            page,
            db,
            userDataCache,
          });

          if (noActionTaken) {
            await sleep({ seconds: 5 });
          } else {
            await sleep({ seconds: 15 });
            peopleUnfollowed += 1;

            if (peopleUnfollowed % 10 === 0) {
              logger.log("Have unfollowed 10 users since last break, pausing");
              await sleep({ minutes: 10 });
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

        await throttle(db);
      } catch (err) {
        logger.error("Failed to unfollow, continuing with next", err);
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
  db,
  userDataCache,
}: {
  username: string;
  page: Page;
  db: JsonDB;
  userDataCache: Record<string, User>;
}) {
  const { dryRun } = await getOptions();

  await navigateToUserAndGetData({ username, page, userDataCache });
  logger.log(`Unfollowing user ${username}`);

  const res: User = { username, time: new Date().getTime() };

  const elementHandle = await findUnfollowButton(page);
  if (!elementHandle) {
    const elementHandle2 = await findFollowButton(page);
    if (elementHandle2) {
      logger.log("User has been unfollowed already");
      res.noActionTaken = true;
    } else {
      logger.log("Failed to find unfollow button");
      res.noActionTaken = true;
    }
  }

  if (!dryRun) {
    if (elementHandle) {
      await elementHandle.click();
      await sleep({ seconds: 2 });
      const confirmHandle = await findUnfollowConfirmButton(page);
      if (confirmHandle) await confirmHandle.click();

      await sleep({ seconds: 5 });

      await checkActionBlocked(page);

      const elementHandle2 = await findFollowButton(page);
      if (!elementHandle2)
        throw new Error("Unfollow button did not change state");
    }

    await db.addPrevUnfollowedUser(res);
    logger.log("Unfollowed user:", username);
  }

  await sleep({ minutes: 2 });

  return res;
}

export async function unfollowNonMutualFollowers({
  limit,
  myUserId,
  page,
  db,
  userDataCache,
}: {
  limit: number;
  myUserId: string;
  page: Page;
  db: JsonDB;
  userDataCache: Record<string, User>;
}) {
  const { excludeUsers } = await getOptions();

  logger.log(`Unfollowing non-mutual followers (limit ${limit})...`);

  const allFollowingGenerator = getFollowersOrFollowingGenerator({
    userId: myUserId || "",
    getFollowers: false,
    page,
  });

  async function condition(username: string) {
    if (excludeUsers.includes(username)) return false; // User is excluded by exclude list
    if (await haveRecentlyFollowedUser(db, username)) {
      logger.log(`Have recently followed user ${username}, skipping`);
      return false;
    }

    const followsMe = await doesUserFollowMe({
      page,
      username,
      myUserId,
      userDataCache,
    });
    logger.info("User follows us?", followsMe);
    return followsMe === false;
  }

  return safelyUnfollowUserListGenerator({
    usersToUnfollow: allFollowingGenerator,
    limit,
    condition,
    page,
    db,
    userDataCache,
  });
}

export async function getUsersToUnfollowSince(db: JsonDB, daysPassed: number) {
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
