import { Page } from "puppeteer";
import { INSTAGRAM_URL } from "src/const";
import { acceptCookies } from "./cookies";
import { doWithTimeout } from "./base";
import { enterLogin } from "./enterLogin";

export const login = async (page: Page) => {
  await page.goto(`${INSTAGRAM_URL}/?hl=en`);

  doWithTimeout([() => acceptCookies(page), () => enterLogin(page)]);
};
