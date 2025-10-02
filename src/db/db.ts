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
  const runNumber = 1;

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

  function getFollowedUsers(timeUnit: number, resetHour: number) {
    const now = new Date().setHours(resetHour, 0, 0, 0);
    return Object.values(prevFollowedUsers).filter(
      (u) => now - u.time < timeUnit,
    );
  }

  async function addPrevFollowedUser(user: User) {
    prevFollowedUsers[user.username] = user;
    await trySaveDb();
  }

  function getUnfollowedUsers(timeUnit: number, resetHour: number) {
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

  const getFollowedUsersCount = (timeUnit: number, resetHour: number) => {
    return getFollowedUsers(timeUnit, resetHour).length;
  };

  const getUnfollowedUsersCount = (timeUnit: number, resetHour: number) => {
    const now = new Date().setHours(resetHour, 0, 0, 0);

    return getUnfollowedUsers(timeUnit, resetHour).filter(
      (user) => !user.noActionTaken && now - user.time < timeUnit,
    ).length;
  };

  function getFollowActionsCount(timeUnit: number, resetHour: number) {
    return (
      getFollowedUsersCount(timeUnit, resetHour) +
      getUnfollowedUsersCount(timeUnit, resetHour)
    );
  }

  const setUserFollowedMe = async (username: string) => {
    const user = prevFollowedUsers[username];
    prevFollowedUsers[username] = { ...user, followsMe: true };
    await trySaveDb();
  };

  const getFollowActionsCountHourly = () => {
    const resetHour = new Date().getHours();
    return getFollowActionsCount(HOUR_IN_MS, resetHour);
  };

  const getFollowActionsCountDaily = () => {
    return getFollowActionsCount(DAY_IN_MS, 24);
  };

  const getFollowedUsersCountDaily = () => {
    return getFollowedUsersCount(DAY_IN_MS, 24);
  };

  const getUnfollowedUsersCountDaily = () => {
    return getUnfollowedUsersCount(DAY_IN_MS, 24);
  };

  const getLikedPhotosCountDaily = () => {
    return getLikedPhotosLastTimeUnit(DAY_IN_MS, 24).length;
  };

  await tryLoadDb();

  return {
    save: trySaveDb,
    addPrevFollowedUser,
    addPrevUnfollowedUser,
    getFollowedUsers,
    getUnfollowedUsers,
    getLikedPhotosLastTimeUnit,
    addLikedPhoto,
    prevFollowedUsers,
    prevUnfollowedUsers,
    prevLikedPhotos,
    getUnfollowedUsersCountDaily,
    getFollowedUsersCountDaily,
    getFollowActionsCount,
    getFollowActionsCountHourly,
    getFollowActionsCountDaily,
    getLikedPhotosCountDaily,
    startTime,
    actions,
    runNumber,
    setUserFollowedMe,
  };
};
