import { Page } from "puppeteer";
import { logger } from "src/util/logger";
import { sleep } from "src/util/util";
import { Navigation } from "../navigation";
import { Locator } from "../locator";

export async function toggleUserSilentMode(page: Page, username: string) {
  const { navigateToUser } = Navigation(page);
  const { findUnfollowButton, findFollowButton } = Locator(page);

  await navigateToUser(username);

  const unfollowButton = await findUnfollowButton();
  const followButton = await findFollowButton();

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

  const muteSectionButton = await page.$$(
    `xpath///div[contains(text(), 'Mute')]/parent::div`,
  );

  if (muteSectionButton.length === 0) {
    logger.log("Can't find mute section button");
    return;
  }

  await muteSectionButton[0].click();
  await sleep(1000);

  const mutePostsButton = await page.$$(
    `xpath///div[contains(text(), 'Posts')]/parent::div`,
  );
  const muteStoriesButton = await page.$$(
    `xpath///div[contains(text(), 'Stories')]/parent::div`,
  );

  if (mutePostsButton.length > 0 && muteStoriesButton.length > 0) {
    logger.log("muting posts and stories");
    await mutePostsButton[0].click();
    await sleep(1000);
    await muteStoriesButton[0].click();
    await sleep(1000);
  } else {
    logger.log("Can't find mute posts/stories button");
  }
}
