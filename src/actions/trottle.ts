import { getJsonDb } from "src/db/db";
import { LIMIT_COLOR, DAY_IN_MS, HOUR_IN_MS } from "src/util/const";
import { logStats, log } from "src/util/logger";
import { getOptions } from "src/util/options";
import { sleep } from "src/util/util";

export class DailyLimitReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyLimitReachedError";
  }
}
const { limits, enableActions } = await getOptions();
const {
  maxFollowsPerDay,
  maxUnfollowsPerDay,
  maxLikesPerDay,
  maxFollowsPerHour,
} = limits;

async function checkReachedFollowedUserDayLimit() {
  const db = await getJsonDb();
  const maxFollowActionsPerDay = maxFollowsPerDay + maxUnfollowsPerDay;

  const currentFollowCount = db.getFollowActionsCount(DAY_IN_MS, 24);
  log(
    `${LIMIT_COLOR}Followed ${currentFollowCount}/${maxFollowActionsPerDay} daily users`,
  );

  if (currentFollowCount >= maxFollowActionsPerDay) {
    throw new DailyLimitReachedError(
      `Daily follow limit reached: ${currentFollowCount}/${maxFollowActionsPerDay}`,
    );
  }
}

async function checkReachedFollowedUserHourLimit() {
  const db = await getJsonDb();

  if (maxFollowsPerHour === "unlimited") {
    return;
  }
  const currentHour = new Date().getHours();

  if (db.getFollowActionsCount(HOUR_IN_MS, currentHour) >= maxFollowsPerHour) {
    log("Hourly follow rate limit reached, pausing 10 min.");
    await sleep({ minutes: 10, silent: true });
    return checkReachedFollowedUserHourLimit();
  }
}

async function checkReachedLikedUserDayLimit() {
  const db = await getJsonDb();

  if (!enableActions.likeImages) {
    return;
  }
  const currentLikesCount = db.getLikedPhotosLastTimeUnit(DAY_IN_MS, 24).length;
  log(
    `${LIMIT_COLOR}Liked ${currentLikesCount}/${maxLikesPerDay} daily pictures`,
  );

  if (currentLikesCount >= maxLikesPerDay) {
    throw new DailyLimitReachedError(
      `Daily like limit reached: ${currentLikesCount}/${maxLikesPerDay}`,
    );
  }
}

let count = 0;
export async function throttle() {
  count++;
  const logFull = count % 5 == 0;
  await logStats(logFull);
  await checkReachedFollowedUserDayLimit();
  await checkReachedFollowedUserHourLimit();
  await checkReachedLikedUserDayLimit();
}
