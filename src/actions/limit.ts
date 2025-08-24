import { getJsonDb } from "src/db/db";
import { LIMIT_COLOR, DAY_IN_MS, HOUR_IN_MS } from "src/util/const";
import { logStats, logger } from "src/util/logger";
import { getOptions } from "src/util/options";
import { sleep } from "src/util/util";

class DailyLimitReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyLimitReachedError";
  }
}
const {
  limits,
  enableActions,
} = await getOptions();
const { maxFollowActionsPerDay, maxLikesPerDay, maxFollowsPerHour } = limits;

async function checkReachedFollowedUserDayLimit() {
  const db = await getJsonDb();

  const currentFollowCount = db.getNumFollowedUsersThisTimeUnit(DAY_IN_MS, 24);
  logger.log(
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

  if (
    db.getNumFollowedUsersThisTimeUnit(HOUR_IN_MS, currentHour) >=
    maxFollowsPerHour
  ) {
    logger.log("Hourly follow rate limit reached, pausing 10 min.");
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
  logger.log(
    `${LIMIT_COLOR}Liked ${currentLikesCount}/${maxLikesPerDay} daily pictures`,
  );

  if (currentLikesCount >= maxLikesPerDay) {
    throw new DailyLimitReachedError(
      `Daily like limit reached: ${currentLikesCount}/${maxLikesPerDay}`,
    );
  }
}

export async function throttle() {
  await logStats();
  await checkReachedFollowedUserDayLimit();
  await checkReachedFollowedUserHourLimit();
  await checkReachedLikedUserDayLimit();
}
