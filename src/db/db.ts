import fs from "fs-extra";
import keyBy from "lodash/keyBy";
import { getOptions } from "../util/options";

export interface User {
  username: string;
  time: number;
  href?: string;
  failed?: boolean;
  noActionTaken?: boolean;
  id?: string;
  followedByCount?: number;
  followsCount?: number;
  isPrivate?: boolean;
  isVerified?: boolean;
  isBusinessAccount?: boolean;
  isProfessionalAccount?: boolean;
  fullName?: string;
  biography?: string;
  profilePicUrlHd?: string;
  externalUrl?: string;
  businessCategoryName?: string;
  categoryName?: string;
}

export const JSONDB = async () => {
  const options = await getOptions();
  const { logger } = options;
  let prevFollowedUsers: Record<string, User> = {};
  let prevUnfollowedUsers: Record<string, User> = {};
  let prevLikedPhotos: User[] = [];

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

  function getLikedPhotosLastTimeUnit(timeUnit: number) {
    const now = new Date().getTime();
    return prevLikedPhotos.filter((u) => now - u.time < timeUnit);
  }

  async function addLikedPhoto({ username, href, time }: User) {
    prevLikedPhotos.push({ username, href, time });
    await trySaveDb();
  }

  function getFollowedLastTimeUnit(timeUnit: number) {
    const now = new Date().getTime();
    return Object.values(prevFollowedUsers).filter(
      (u) => now - u.time < timeUnit,
    );
  }

  async function addPrevFollowedUser(user: User) {
    prevFollowedUsers[user.username] = user;
    await trySaveDb();
  }

  function getUnfollowedLastTimeUnit(timeUnit: number) {
    const now = new Date().getTime();
    return Object.values(prevUnfollowedUsers).filter(
      (u) => now - u.time < timeUnit,
    );
  }

  async function addPrevUnfollowedUser(user: User) {
    prevUnfollowedUsers[user.username] = user;
    await trySaveDb();
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
  };
};
