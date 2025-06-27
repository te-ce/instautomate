import puppeteer from "puppeteer";

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
  });
  const page = await browser.newPage();

  await page.goto("https://www.instagram.com/");
  await page.setViewport({ width: 1080, height: 1024 });
})();
