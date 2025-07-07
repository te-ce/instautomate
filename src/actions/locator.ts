import { Page } from "puppeteer";

export const Locator = (page: Page) => {
  // How to test xpaths in the browser:
  // document.evaluate("your xpath", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null ).singleNodeValue
  async function findButtonWithText(text: string) {
    // todo escape text?

    // button seems to look like this now:
    // <button class="..."><div class="...">Follow</div></button>
    // https://sqa.stackexchange.com/questions/36918/xpath-text-buy-now-is-working-but-not-containstext-buy-now
    // https://github.com/mifi/SimpleInstaBot/issues/106
    let elementHandles = await page.$$(
      `xpath///header//button[contains(.,'${text}')]`,
    );
    if (elementHandles.length > 0) return elementHandles[0];

    // old button:
    elementHandles = await page.$$(`xpath///header//button[text()='${text}']`);
    if (elementHandles.length > 0) return elementHandles[0];

    return undefined;
  }

  async function findFollowButton() {
    let button = await findButtonWithText("Follow");
    if (button) return button;

    button = await findButtonWithText("Follow Back");
    if (button) return button;

    return undefined;
  }

  async function findUnfollowButton() {
    let button = await findButtonWithText("Following");
    if (button) return button;

    button = await findButtonWithText("Requested");
    if (button) return button;

    let elementHandles = await page.$$(
      "xpath///header//button[*//span[@aria-label='Following']]",
    );
    if (elementHandles.length > 0) return elementHandles[0];

    elementHandles = await page.$$(
      "xpath///header//button[*//span[@aria-label='Requested']]",
    );
    if (elementHandles.length > 0) return elementHandles[0];

    elementHandles = await page.$$(
      "xpath///header//button[*//*[name()='svg'][@aria-label='Following']]",
    );
    if (elementHandles.length > 0) return elementHandles[0];

    elementHandles = await page.$$(
      "xpath///header//button[*//*[name()='svg'][@aria-label='Requested']]",
    );
    if (elementHandles.length > 0) return elementHandles[0];

    return undefined;
  }

  async function findUnfollowConfirmButton() {
    let elementHandles = await page.$$("xpath///button[text()='Unfollow']");
    if (elementHandles.length > 0) return elementHandles[0];

    // https://github.com/mifi/SimpleInstaBot/issues/191
    elementHandles = await page.$$(
      "xpath///*[@role='button'][contains(.,'Unfollow')]",
    );
    return elementHandles[0];
  }

  return {
    findFollowButton,
    findUnfollowButton,
    findUnfollowConfirmButton,
  };
};
