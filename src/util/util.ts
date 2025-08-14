import { Page } from "puppeteer";
import { HOUR_IN_MS, INSTAGRAM_URL, MINUTE_IN_MS, SECOND_IN_MS } from "./const";
import { logger } from "./logger";

export function shuffleArray(arrayIn: any[]) {
  const array = [...arrayIn];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// https://stackoverflow.com/questions/14822153/escape-single-quote-in-xpath-with-nokogiri
// example str: "That's mine", he said.
export function escapeXpathStr(str: string) {
  const parts = str.split("'").map((token) => `'${token}'`);
  if (parts.length === 1) return `${parts[0]}`;
  const str2 = parts.join(', "\'", ');
  return `concat(${str2})`;
}

const sleepFixed = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const sleepWithDeviation = (ms: number) => {
  const deviation = ms * 0.2 * (2 * Math.random() - 1);
  const secondsDeviation = deviation % 60;
  const sleep = ms + secondsDeviation;
  logger.log("Waiting", formatMs(sleep), "...");
  return sleepFixed(sleep);
};

export const sleep = ({
  seconds = 0,
  minutes = 0,
  hours = 0,
}: {
  seconds?: number;
  minutes?: number;
  hours?: number;
}) => {
  const ms =
    seconds * SECOND_IN_MS + minutes * MINUTE_IN_MS + hours * HOUR_IN_MS;
  return sleepWithDeviation(ms);
};

const formatMs = (ms: number) => {
  const hours = Math.floor(ms / HOUR_IN_MS);

  const restMs = ms - hours * HOUR_IN_MS;
  const minutes = Math.floor(restMs / MINUTE_IN_MS);

  const restMs2 = restMs - minutes * MINUTE_IN_MS;
  const seconds = Math.floor(restMs2 / SECOND_IN_MS);

  return `${hours}h ${minutes}m ${seconds}s`;
};

export const getPageJson = async (page: Page) => {
  return JSON.parse(
    (await (
      await (await page.$("pre"))?.getProperty("textContent")
    )?.jsonValue()) ?? "{}",
  );
};

export const getUserPageUrl = (username: string) =>
  `${INSTAGRAM_URL}/${encodeURIComponent(username)}`;
