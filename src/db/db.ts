import fs from "fs-extra";
import keyBy from "lodash/keyBy";
import { User } from "src/util/types";
import { getOptions } from "../util/options";
import { log } from "src/util/logger";
import { DAY_IN_MS, HOUR_IN_MS } from "src/util/const";

export type JsonDB = Awaited<ReturnType<typeof initJsonDb>>;

let jsonDb: JsonDB | null = null;

export const getJsonDb = async () => {
  if (jsonDb === null) {
    jsonDb = await initJsonDb();
  }
  return jsonDb;
};

export const initJsonDb = async () => {
  const { paths } = await getOptions();
  let prevFollowedUsers: Record<string, User> = {};
  let prevUnfollowedUsers: Record<string, User> = {};
  let prevLikedPhotos: User[] = [];
  const startTime = new Date();
  const actions = { follow: 0, unfollow: 0, like: 0, unlike: 0 };

  async function trySaveDb() {
    try {
      await fs.writeFile(
        paths.followed,
        JSON.stringify(Object.values(prevFollowedUsers)),
      );
      await fs.writeFile(
        paths.unfollowed,
        JSON.stringify(Object.values(prevUnfollowedUsers)),
      );
      await fs.writeFile(paths.likedPhotos, JSON.stringify(prevLikedPhotos));
    } catch (err) {
      log("Failed to save database", err);
    }
  }

  async function tryLoadDb() {
    try {
      prevFollowedUsers = keyBy(
        JSON.parse(await fs.readFile(paths.followed, "utf8")),
        "username",
      );
    } catch (err) {
      log("No followed database found", err);
    }
    try {
      prevUnfollowedUsers = keyBy(
        JSON.parse(await fs.readFile(paths.unfollowed, "utf8")),
        "username",
      );
    } catch (err) {
      log("No unfollowed database found", err);
    }
    try {
      prevLikedPhotos = JSON.parse(
        await fs.readFile(paths.likedPhotos, "utf8"),
      );
    } catch (err) {
      log("No likes database found", err);
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

  const setUserFollowedMe = async (username: string) => {
    const user = prevFollowedUsers[username];
    prevFollowedUsers[username] = { ...user, followsMe: true };
    await trySaveDb();
  };

  const getHourlyFollowedUsersCount = () => {
    const resetHour = new Date().getHours();
    return getNumFollowedUsersThisTimeUnit(HOUR_IN_MS, resetHour);
  };

  const getDailyFollowedUsersCount = () => {
    return getNumFollowedUsersThisTimeUnit(DAY_IN_MS, 24);
  };

  const getLikedPhotosCount = () => {
    return getLikedPhotosLastTimeUnit(DAY_IN_MS, 24).length;
  };

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
    getHourlyFollowedUsersCount,
    getDailyFollowedUsersCount,
    getLikedPhotosCount,
    startTime,
    actions,
    setUserFollowedMe,
  };
};
