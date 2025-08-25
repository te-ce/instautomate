import Instauto from "src/bot";
import { getOptions } from "src/util/options";
import { sleep } from "src/util/util";
import { throttle } from "./limit";
import { logger } from "src/util/logger";
import { WARNING_COLOR } from "src/util/const";

export const runActions = async (
  instauto: Awaited<ReturnType<typeof Instauto>>,
) => {
  await throttle();
  const options = await getOptions();

  let unfollowedCount = 0;

  // This can be used to unfollow people:
  // Will unfollow auto-followed AND manually followed accounts who are not following us back, after some time has passed
  if (options.enableActions.unfollowNonMutual) {
    const unfollowedNonMutual = await instauto.unfollowNonMutualFollowers({
      limit: Math.floor(options.limits.maxFollowActionsPerDay * (2 / 3)),
      page: instauto.getPage(),
      userDataCache: instauto.userDataCache,
    });

    unfollowedCount += unfollowedNonMutual;

    await sleep({ minutes: 10 });
  }

  // Unfollow previously auto-followed users (regardless of whether or not they are following us back)
  // after a certain amount of days (2 weeks)
  // Leave room to do following after this too (unfollow 2/3 of maxFollowsPerDay)
  if (options.enableActions.unfollowAny) {
    const MIN_UNFOLLOW_COUNT = 10;
    const unfollowedAny = await instauto.unfollowAnyFollowed({
      limit:
        MIN_UNFOLLOW_COUNT +
        Math.floor(options.limits.maxFollowActionsPerDay * (2 / 3)),
      page: instauto.getPage(),
      userDataCache: instauto.userDataCache,
    });

    unfollowedCount += unfollowedAny;

    if (unfollowedCount > 0) await sleep({ minutes: 10 });
  }

  // Now go through each of these and follow a certain amount of their followers
  if (options.enableActions.follow) {
    await instauto.followUsersFollowers({
      usersToFollowFollowersOf: options.usersToFollowFollowersOf,
      maxFollowsTotal: options.limits.maxFollowActionsPerDay - unfollowedCount,
      skipPrivate: options.skipPrivate,
      enableLikeImages: options.enableActions.likeImages,
      likeImagesMax: options.limits.maxLikesPerDay,
      page: instauto.getPage(),
      userDataCache: instauto.userDataCache,
    });
  }

  logger.log(`${WARNING_COLOR}Limits not reached, running actions again`);
  await sleep({ minutes: 2 });
  await runActions(instauto);
};
