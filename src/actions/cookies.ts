import { Page } from "puppeteer";

export const acceptCookies = async (page: Page) => {
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const targetButton = buttons.find((btn) =>
      btn.textContent?.trim().toLowerCase().includes("allow all cookies"),
    );
    if (targetButton) {
      (targetButton as HTMLElement).click();
    }
  });
};
