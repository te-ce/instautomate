import Instauto from "src/bot";
import { getOptions } from "src/util/options";
import { sleep } from "src/util/util";
import { throttle } from "./limit";
import { log } from "src/util/logger";
import { WARNING_COLOR } from "src/util/const";

export const runActions = async (
  instauto: Awaited<ReturnType<typeof Instauto>>,
) => {
  const options = await getOptions();
  const MIN_UNFOLLOW_COUNT = 10;
  const maxUnfollowActionsPerDay =
    MIN_UNFOLLOW_COUNT +
    Math.floor(options.limits.maxFollowActionsPerDay * (2 / 3));

  let unfollowedCount = 0;

  if (options.enableActions.unfollowNonMutual) {
    const unfollowedNonMutual = await instauto.unfollowNonMutualFollowers({
      limit: maxUnfollowActionsPerDay - unfollowedCount,
      page: instauto.getPage(),
      userDataCache: instauto.userDataCache,
    });

    unfollowedCount += unfollowedNonMutual;

    await sleep({ minutes: 1 });
  }

  if (options.enableActions.unfollowAny) {
    const unfollowedAny = await instauto.unfollowAnyFollowed({
      limit: maxUnfollowActionsPerDay - unfollowedCount,
      page: instauto.getPage(),
      userDataCache: instauto.userDataCache,
    });

    unfollowedCount += unfollowedAny;

    if (unfollowedCount > 0) await sleep({ minutes: 1 });
  }

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

  await throttle();
  log(`${WARNING_COLOR}Limits not reached, running actions again`);
  await sleep({ minutes: 2 });
  await runActions(instauto);
};
