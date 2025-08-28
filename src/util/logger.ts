import { getDurationFormatted } from "./util";
import { getJsonDb } from "src/db/db";
import { getOptions } from "./options";
import {
  COLORS,
  DATE_COLOR,
  FINISH_COLOR,
  STARTUP_COLOR,
  STATS_COLOR,
  USERNAME_COLOR,
} from "./const";

type ConsoleMethod = "log" | "info" | "debug" | "error" | "trace" | "warn";

export const log = (fn: ConsoleMethod, ...args: unknown[]) =>
  console[fn](
    `${DATE_COLOR}${new Date().toISOString()}${COLORS.RESET}`,
    ...args,
  );
export const logger = Object.fromEntries(
  ["log", "info", "debug", "error", "trace", "warn"].map((fn) => [
    fn,
    (...args: unknown[]) => log(fn as ConsoleMethod, ...args, COLORS.RESET),
  ]),
);

export const logStartup = async () => {
  const db = await getJsonDb();
  const { username } = await getOptions();
  const color = STARTUP_COLOR;

  logger.log("");
  logger.log("");
  logger.log(`${color}== STARTING UP ==`);
  logger.log(`${color}Current day: ${db.startTime.toLocaleDateString()}`);
  logger.log(`${color}Current time: ${db.startTime.toLocaleTimeString()}`);
  logger.log(`${color}Username: ${colorName(username)}`);
  logger.log("");
  logger.log("");
};

export const logFinish = async () => {
  const options = await getOptions();
  const color = FINISH_COLOR;

  logger.log("");
  logger.log("");
  logger.log(`${color}== FINISHED ==`);
  logger.log(`${color}Current day: ${new Date().toLocaleDateString()}`);
  logger.log(`${color}Current time: ${new Date().toLocaleTimeString()}`);
  logger.log(`${color}Username: ${colorName(options.username)}`);
  await logStats();
  logger.log("");
  logger.log("");
};

export const logStats = async () => {
  const db = await getJsonDb();
  let actions = "";
  let areActionsDone = false;
  const color = STATS_COLOR;

  for (const [action, count] of Object.entries(db.actions)) {
    if (count > 0) {
      actions += `${count}x ${action}, `;
      areActionsDone = true;
    }
  }

  const duration = await getDurationFormatted();
  if (areActionsDone) {
    const actionsFormatted = actions.slice(0, -2);
    logger.log(`${color}[${duration} | ${actionsFormatted}]`);
  } else {
    logger.log(`${color}[${duration} | 0x actions]`);
  }
};

export const colorName = (username: string) => {
  return `${USERNAME_COLOR}${username}${COLORS.RESET}`;
};
