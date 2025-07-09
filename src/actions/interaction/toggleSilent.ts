import { Page } from "puppeteer";
import { logger } from "src/util/logger";
import { sleep } from "src/util/util";
import { navigateToUser } from "../navigation";
import { findUnfollowButton, findFollowButton } from "../locator";

export async function toggleUserSilentMode(page: Page, username: string) {
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
  await muteStoriesValue(page);
  const muteSectionButton = await page.$$(`xpath///span[text()='Mute']`);

  if (!muteSectionButton) {
    logger.log("Can't find mute section button");
    return;
  }

  await muteSectionButton[0].click();
  await sleep({ seconds: 2 });

  const mutePostsButton = await page.$$(`xpath///span[text()='Posts']`);
  const muteStoriesButton = await page.$$(`xpath///span[text()='Stories']`);

  if (mutePostsButton.length > 0 && muteStoriesButton.length > 0) {
    logger.log("muting posts and stories");
    await mutePostsButton[0].click();
    await sleep({ seconds: 1 });
    await muteStoriesButton[0].click();
    await sleep({ seconds: 1 });
  } else {
    logger.log("Can't find mute posts/stories button");
  }
}

const muteStoriesValue = async (page: Page) => {
  // Find the checkbox near the "Posts" text
  const ariaChecked = await page.evaluate(() => {
    // Locate the span with "Posts" text
    const postsSpan = Array.from(document.querySelectorAll("span")).find(
      (span) => span?.textContent?.trim() === "Posts",
    );

    if (!postsSpan) {
      return null; // couldn't find Posts text
    }

    // Traverse upwards to find a common container
    const container = postsSpan.closest("div");

    if (!container) {
      return null; // couldn't find container
    }

    // Now find the checkbox input within the container or nearby
    const checkbox = container.querySelector('input[type="checkbox"]');

    if (checkbox) {
      return checkbox.getAttribute("aria-checked");
    }

    return null; // checkbox not found
  });

  const StoriesChecked =
    ariaChecked === "true" ? true : ariaChecked === "false" ? false : undefined;

  logger.log(`mute Stories value: ${StoriesChecked}`);
  return StoriesChecked;
};
