import { log } from "./logger";
import fs from "fs";
import path from "path";
import { Options, OptionsSchema } from "./types.js";

let options: Options | null = null;

export const getOptions = async () => {
  if (options === null) {
    options = await initOptions();
  }
  return options;
};

export const initOptions = async () => {
  const basePath = "./config";
  const args = process.argv.slice(2);

  // Filter out flags to get positional arguments
  const positionalArgs = args.filter((arg) => !arg.startsWith("--"));
  const env = positionalArgs[0] ?? "default";
  const password = positionalArgs[1] ?? "";

  const optionsPath = path.join(basePath, env, "options.ts");
  const cookiesPath = path.join(basePath, env, "cookies.json");

  if (password === "" && !fs.existsSync(cookiesPath)) {
    throw new Error(
      `No password provided and no cookies found. Restart process with password as second argument. For example: "npm run start ${env} MyPassword"`,
    );
  }

  try {
    if (!fs.existsSync(optionsPath)) {
      if (env !== "default") {
        throw new Error(
          `Configuration file not found: ${optionsPath}. Please create the configuration file first.`,
        );
      } else {
        throw new Error(
          `Default configuration file not found: ${optionsPath}. Please create the default configuration file first.`,
        );
      }
    }

    const optionsModule = await import(optionsPath);
    const importedOptions = optionsModule.options;

    let headless = importedOptions.headless;
    if (args.includes("headless")) {
      headless = true;
    }
    if (args.includes("head")) {
      headless = false;
    }

    const optionsWithPaths: Options = {
      ...importedOptions,
      password,
      paths: {
        cookies: path.join(basePath, env, "cookies.json"),
        followed: path.join(basePath, env, "followed.json"),
        unfollowed: path.join(basePath, env, "unfollowed.json"),
        likedPhotos: path.join(basePath, env, "liked-photos.json"),
        screenshots: path.join(basePath, env, "screenshots"),
      },
      headless,
    };

    options = OptionsSchema.parse(optionsWithPaths);
    return options;
  } catch (error) {
    log(`Error loading options from ${optionsPath}:`, error);
    throw error;
  }
};
