import { getDurationFormatted } from "./util";
import { getJsonDb } from "src/db/db";
import { getOptions } from "./options";

type ConsoleMethod = "log" | "info" | "debug" | "error" | "trace" | "warn";

export const log = (fn: ConsoleMethod, ...args: any[]) =>
  console[fn](new Date().toISOString(), ...args);
export const logger = Object.fromEntries(
  ["log", "info", "debug", "error", "trace", "warn"].map((fn) => [
    fn,
    (...args: any[]) => log(fn as ConsoleMethod, ...args),
  ]),
);

export const logFinish = async () => {
  const options = await getOptions();
  logger.log("");
  logger.log("");
  logger.log("== FINISHED ==");
  logger.log(`Current day: ${new Date().toLocaleDateString()}`);
  logger.log(`Current time: ${new Date().toLocaleTimeString()}`);
  logger.log(`Username: ${options.username}`);
  await logStats();
  logger.log("");
  logger.log("");
};

export const logStats = async () => {
  const db = await getJsonDb();
  let actions = "";

  for (const [action, count] of Object.entries(db.actions)) {
    if (count > 0) {
      actions += `${count}x ${action}, `;
    }
  }
  actions = actions.slice(0, -2);
  const duration = await getDurationFormatted();
  logger.log(`[${duration} | ${actions}]`);
};
