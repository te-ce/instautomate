import { Page } from "puppeteer";
import { INSTAGRAM_URL } from "src/const";
import { acceptCookies } from "./cookies";

export const login = async (page: Page) => {
  await page.goto(`${INSTAGRAM_URL}/?hl=en`);

  setTimeout(() => {
    console.log("accepting cookies");
    acceptCookies(page);
  }, 2000);
};
