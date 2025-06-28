import { Page } from "puppeteer";
import config from "../../config.json";

export const enterLogin = async (page: Page) => {
  // Fill username field
  await page.locator('input[name="username"]').fill(config.username);

  // Fill password field
  await page.locator('input[name="password"]').fill(config.password);

  // Click login button
  await page.locator('button:has-text("Log in")').click();
};
