import { Page } from "puppeteer";

export async function isLoggedIn(page: Page) {
  return (await page.$$('xpath///*[@aria-label="Home"]')).length === 1;
}
