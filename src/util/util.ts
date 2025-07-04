import { Page } from "puppeteer";
import { INSTAGRAM_URL } from "./const";
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

export const sleep = (ms: number, deviation = 1) => {
  const msWithDeviation = (Math.random() * deviation + 1) * ms;
  logger.log("Waiting", (msWithDeviation / 1000).toFixed(2), "sec");
  return sleepFixed(msWithDeviation);
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
