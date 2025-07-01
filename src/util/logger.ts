type ConsoleMethod = "log" | "info" | "debug" | "error" | "trace" | "warn";

export const log = (fn: ConsoleMethod, ...args: any[]) =>
  console[fn](new Date().toISOString(), ...args);
export const logger = Object.fromEntries(
  ["log", "info", "debug", "error", "trace", "warn"].map((fn) => [
    fn,
    (...args: any[]) => log(fn as ConsoleMethod, ...args),
  ]),
);
