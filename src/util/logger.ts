import { getDurationFormatted } from "./util";
import { getJsonDb } from "src/db/db";
import { getOptions } from "./options";
import {
  CLEAR_PREVIOUS,
  COLORS,
  DATE_COLOR,
  FINISH_COLOR,
  STARTUP_COLOR,
  STATS_COLOR,
  USERNAME_COLOR,
} from "./const";

let lastLogWasTemporary = false;

const tempLog = (...args: unknown[]) => {
  log(...args);
  lastLogWasTemporary = true;
};

const log = (...args: unknown[]) => {
  console.log(
    lastLogWasTemporary ? CLEAR_PREVIOUS : "",
    `${DATE_COLOR}${new Date().toISOString()}${COLORS.RESET}`,
    ...args,
  );
  lastLogWasTemporary = false;
};

log.temp = tempLog;
export { log };

export const logStartup = async () => {
  const db = await getJsonDb();
  const { username } = await getOptions();
  const color = STARTUP_COLOR;

  const prevFollowedCount = db.getFollowedUsersCountDaily();
  const prevUnfollowedUsersCount = db.getUnfollowedUsersCountDaily();

  log("");
  log("");
  log(`${color}== STARTING UP ==`);
  log(`${color}Current day: ${db.startTime.toLocaleDateString()}`);
  log(`${color}Current time: ${db.startTime.toLocaleTimeString()}`);
  log(`${color}Username: ${colorName(username)}`);
  log("");
  log(`${color}Stats last 24h:`);
  log(
    `${color}${prevFollowedCount}x follow, ${prevUnfollowedUsersCount}x unfollow`,
  );
  log("");
  log("");
};

export const logFinish = async () => {
  const options = await getOptions();
  const color = FINISH_COLOR;

  log("");
  log("");
  log(`${color}== FINISHED ==`);
  log(`${color}Current day: ${new Date().toLocaleDateString()}`);
  log(`${color}Current time: ${new Date().toLocaleTimeString()}`);
  log(`${color}Username: ${colorName(options.username)}`);
  await logStats(true);
  log("");
  log("");
};

export const logStats = async (full?: boolean) => {
  const db = await getJsonDb();
  const color = STATS_COLOR;
  const totalFollowedCount = db.getFollowedUsersCountDaily();
  const totalUnfollowedCount = db.getUnfollowedUsersCountDaily();
  let actions = "";
  let areActionsDone = false;

  for (const [action, count] of Object.entries(db.actions)) {
    if (count > 0) {
      actions += `${count}x ${action}, `;
      areActionsDone = true;
    }
  }

  const duration = await getDurationFormatted();
  if (areActionsDone) {
    const actionsFormatted = actions.slice(0, -2);
    log(`${color}[${duration} | ${actionsFormatted}]`);
  } else {
    log(`${color}[${duration} | 0x actions]`);
  }
  if (full) {
    log(
      `${COLORS.DARK_GREEN}[Last 24h: | ${totalFollowedCount}x follow, ${totalUnfollowedCount}x unfollow]`,
    );
  }
};

export const colorName = (username: string) => {
  return `${USERNAME_COLOR}${username}${COLORS.RESET}`;
};
