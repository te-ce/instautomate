import { Page } from "puppeteer";
import { INSTAGRAM_URL } from "src/const";

export const login = async (page: Page) => {
  await page.goto(`${INSTAGRAM_URL}/?hl=en`);
};
