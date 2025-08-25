import { getJsonDb } from "./db/db.ts";
import { Browser } from "puppeteer";
import { getOptions } from "./util/options.ts";
import { User } from "./util/types.ts";
import { startup } from "./actions/startup.ts";
import { doesUserFollowMe } from "./util/status.ts";
import {
  getFollowersOrFollowing,
  getUsersWhoLikedContent,
  listManuallyFollowedUsers,
  navigateToUserAndGetData,
  navigateToUserAndGetProfileId,
  processUserFollowers,
  processUsersFollowers,
} from "./actions/data.ts";
import {
  safelyUnfollowUsers,
  unfollowNonMutualFollowers,
  unfollowAnyFollowed,
  unfollowUser,
} from "./actions/interaction/unfollow.ts";
import {
  followUser,
  safelyFollowUserList,
} from "./actions/interaction/follow.ts";
import { likeUserImages } from "./actions/interaction/likeImage.ts";

export const Instauto = async (browser: Browser) => {
  const options = await getOptions();
  const { username } = options;
  const page = await browser.newPage();
  const userDataCache: Record<string, User> = {};

  await startup(page, browser, options);

  const myUserId = await navigateToUserAndGetProfileId(
    username,
    page,
    userDataCache,
  );

  if (!myUserId) throw new Error("My user ID not found");

  function getPage() {
    return page;
  }

  return {
    followUserFollowers: processUserFollowers,
    unfollowNonMutualFollowers,
    unfollowAnyFollowed,
    followUser,
    unfollowUser,
    likeUserImages,
    listManuallyFollowedUsers,
    getFollowersOrFollowing,
    getUsersWhoLikedContent,
    safelyUnfollowUsers,
    safelyFollowUserList,
    getPage,
    followUsersFollowers: processUsersFollowers,
    doesUserFollowMe,
    navigateToUserAndGetData,
    myUserId,
    userDataCache,
  };
};

Instauto.getJsonDb = getJsonDb;

export default Instauto;
