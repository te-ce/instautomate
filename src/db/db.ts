import fs from "fs-extra";
import keyBy from "lodash/keyBy";
import { User } from "src/util/types";
import { getOptions } from "../util/options";
import { logger } from "src/util/logger";

export type JsonDB = Awaited<ReturnType<typeof initJsonDb>>;

let jsonDb: JsonDB | null = null;

export const getJsonDb = async () => {
  if (jsonDb === null) {
    jsonDb = await initJsonDb();
  }
  return jsonDb;
};

export const initJsonDb = async () => {
  const options = await getOptions();
  let prevFollowedUsers: Record<string, User> = {};
  let prevUnfollowedUsers: Record<string, User> = {};
  let prevLikedPhotos: User[] = [];
  const startTime = new Date();

  async function trySaveDb() {
    try {
      await fs.writeFile(
        options.followedDbPath,
        JSON.stringify(Object.values(prevFollowedUsers)),
      );
      await fs.writeFile(
        options.unfollowedDbPath,
        JSON.stringify(Object.values(prevUnfollowedUsers)),
      );
      await fs.writeFile(
        options.likedPhotosDbPath,
        JSON.stringify(prevLikedPhotos),
      );
    } catch (err) {
      logger.error("Failed to save database", err);
    }
  }

  async function tryLoadDb() {
    try {
      prevFollowedUsers = keyBy(
        JSON.parse(await fs.readFile(options.followedDbPath, "utf8")),
        "username",
      );
    } catch (err) {
      logger.warn("No followed database found", err);
    }
    try {
      prevUnfollowedUsers = keyBy(
        JSON.parse(await fs.readFile(options.unfollowedDbPath, "utf8")),
        "username",
      );
    } catch (err) {
      logger.warn("No unfollowed database found", err);
    }
    try {
      prevLikedPhotos = JSON.parse(
        await fs.readFile(options.likedPhotosDbPath, "utf8"),
      );
    } catch (err) {
      logger.warn("No likes database found", err);
    }
  }

  function getLikedPhotosLastTimeUnit(timeUnit: number, resetHour: number) {
    const now = new Date().setHours(resetHour, 0, 0, 0);
    return prevLikedPhotos.filter((u) => now - u.time < timeUnit);
  }

  async function addLikedPhoto({ username, href, time }: User) {
    prevLikedPhotos.push({ username, href, time });
    await trySaveDb();
  }

  function getFollowedLastTimeUnit(timeUnit: number, resetHour: number) {
    const now = new Date().setHours(resetHour, 0, 0, 0);
    return Object.values(prevFollowedUsers).filter(
      (u) => now - u.time < timeUnit,
    );
  }

  async function addPrevFollowedUser(user: User) {
    prevFollowedUsers[user.username] = user;
    await trySaveDb();
  }

  function getUnfollowedLastTimeUnit(timeUnit: number, resetHour: number) {
    const now = new Date().setHours(resetHour, 0, 0, 0);
    return Object.values(prevUnfollowedUsers).filter(
      (u) => now - u.time < timeUnit,
    );
  }

  async function addPrevUnfollowedUser(user: User) {
    prevUnfollowedUsers[user.username] = user;
    delete prevFollowedUsers[user.username];
    await trySaveDb();
  }

  function getNumFollowedUsersThisTimeUnit(
    timeUnit: number,
    resetHour: number,
  ) {
    const now = new Date().setHours(resetHour, 0, 0, 0);

    return (
      getFollowedLastTimeUnit(timeUnit, resetHour).length +
      getUnfollowedLastTimeUnit(timeUnit, resetHour).filter(
        (user) => !user.noActionTaken && now - user.time < timeUnit,
      ).length
    );
  }

  await tryLoadDb();

  return {
    save: trySaveDb,
    addPrevFollowedUser,
    addPrevUnfollowedUser,
    getFollowedLastTimeUnit,
    getUnfollowedLastTimeUnit,
    getLikedPhotosLastTimeUnit,
    addLikedPhoto,
    prevFollowedUsers,
    prevUnfollowedUsers,
    prevLikedPhotos,
    getNumFollowedUsersThisTimeUnit,
    startTime,
  };
};
