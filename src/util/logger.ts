
// Optional: Custom logger with timestamps
export const log = (fn: string, ...args: any[]) => console[fn](new Date().toISOString(), ...args);
export const logger = Object.fromEntries(
  ["log", "info", "debug", "error", "trace", "warn"].map((fn) => [
    fn,
    (...args) => log(fn, ...args),
  ]),
);
