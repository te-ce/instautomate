import { Page } from "puppeteer";
import { logger } from "src/util/logger";
import { sleep } from "src/util/util";
import { navigateToUser } from "../navigation";
import { findUnfollowButton, findFollowButton } from "../locator";

export async function toggleMuteUser(
  page: Page,
  username: string,
  mute: boolean,
) {
  await navigateToUser(page, username);

  const unfollowButton = await findUnfollowButton(page);
  const followButton = await findFollowButton(page);

  if (!unfollowButton && followButton) {
    logger.log("We are not following user, can't set silent");
    return;
  }

  if (!unfollowButton && !followButton) {
    logger.log(
      "Can't find unfollow/follow button, are you already on the user page?",
    );
    return;
  }

  await unfollowButton?.click();
  await sleep({ seconds: 2 });
  const muteSectionButton = await page.$$(`xpath///span[text()='Mute']`);

  if (!muteSectionButton) {
    logger.log("Can't find mute section button");
    return;
  }

  await muteSectionButton[0].click();
  await sleep({ seconds: 1 });

  const muteStoriesButton = await page.$$(`xpath///span[text()='Stories']`);

  const { arePostsMuted, areStoriesMuted } = await muteValues(page);

  if (arePostsMuted !== mute) {
    const mutePostsButton = await page.$$(`xpath///span[text()='Posts']`);

    if (mutePostsButton.length > 0) {
      await mutePostsButton[0].click();
    }
  }

  if (areStoriesMuted !== mute) {
    if (muteStoriesButton.length > 0) {
      await muteStoriesButton[0].click();
    }
  }

  const saveButton = await page.$$(`xpath///div[text()='Save']`);
  const closeButton = await page.$$('svg[aria-label="Close"]');

  if (saveButton.length > 0) {
    await saveButton[0].click();
    await sleep({ seconds: 2 });
  }

  logger.log(`Toggled mute of ${username} to ${mute}`);

  if (closeButton.length > 0) {
    await closeButton[0].click();
  }
}

const muteValues = async (page: Page) => {
  const checkedValues = await page.$$eval(
    'input[type="checkbox"], input[type="radio"]',
    (inputs) =>
      inputs
        .map((input) => ({
          name: input.name || "unnamed",
          type: input.type,
          checked: input.checked,
        }))
        .filter((input) => input.type === "checkbox"),
  );

  const arePostsMuted = checkedValues[0].checked;
  const areStoriesMuted = checkedValues[1].checked;

  return { arePostsMuted, areStoriesMuted };
};
