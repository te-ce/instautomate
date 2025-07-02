import { logger } from "./logger.js";
import fs from "fs";
import path from "path";
import { Options, OptionsSchema } from "./types.js";

export const getOptions = async (): Promise<Options> => {
  const basePath = "./config";
  const args = process.argv.slice(2);
  const env = args[0] ?? "default";
  const password = args[1] ?? "";

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
    const options = optionsModule.options;

    const optionsWithPaths = {
      ...options,
      password,
      cookiesPath: path.join(basePath, env, "cookies.json"),
      followedDbPath: path.join(basePath, env, "followed.json"),
      unfollowedDbPath: path.join(basePath, env, "unfollowed.json"),
      likedPhotosDbPath: path.join(basePath, env, "liked-photos.json"),
      screenshotsPath: path.join(basePath, env, "screenshots"),
    };

    return OptionsSchema.parse(optionsWithPaths);
  } catch (error) {
    logger.error(`Error loading options from ${optionsPath}:`, error);
    throw error;
  }
};
