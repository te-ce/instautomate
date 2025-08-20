import { JsonDB } from "src/db/db";
import { DAY_IN_MS, HOUR_IN_MS } from "src/util/const";
import { logger } from "src/util/logger";
import { getOptions } from "src/util/options";
import { sleep } from "src/util/util";

class DailyLimitReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyLimitReachedError";
  }
}

const { maxFollowActionsPerDay, maxLikesPerDay, maxFollowsPerHour } =
  await getOptions();

async function checkReachedFollowedUserDayLimit(db: JsonDB) {
  const currentFollowCount = db.getNumFollowedUsersThisTimeUnit(DAY_IN_MS, 24);
  logger.log(
    `Followed ${currentFollowCount}/${maxFollowActionsPerDay} daily users`,
  );

  if (currentFollowCount >= maxFollowActionsPerDay) {
    throw new DailyLimitReachedError(
      `Daily follow limit reached: ${currentFollowCount}/${maxFollowActionsPerDay}`,
    );
  }
}

async function checkReachedFollowedUserHourLimit(db: JsonDB) {
  const currentHour = new Date().getHours();
  if (
    db.getNumFollowedUsersThisTimeUnit(HOUR_IN_MS, currentHour) >=
    maxFollowsPerHour
  ) {
    logger.log("Hourly follow rate limit reached, pausing 10 min.");
    await sleep({ minutes: 10, silent: true });
    return checkReachedFollowedUserHourLimit(db);
  }
}

async function checkReachedLikedUserDayLimit(db: JsonDB) {
  const currentLikesCount = db.getLikedPhotosLastTimeUnit(DAY_IN_MS, 24).length;
  logger.log(`Liked ${currentLikesCount}/${maxLikesPerDay} daily pictures`);

  if (currentLikesCount >= maxLikesPerDay) {
    throw new DailyLimitReachedError(
      `Daily like limit reached: ${currentLikesCount}/${maxLikesPerDay}`,
    );
  }
}

export async function throttle(db: JsonDB) {
  await checkReachedFollowedUserDayLimit(db);
  await checkReachedFollowedUserHourLimit(db);
  await checkReachedLikedUserDayLimit(db);
}
