import { Page } from "puppeteer";
import { logger } from "src/util/logger";
import { Media, User } from "src/util/types";
import { shuffleArray, sleep } from "src/util/util";
import { navigateToUserAndGetData } from "../data";
import { getOptions } from "src/util/options";
import { JsonDB } from "src/db/db";

export async function likeCurrentUserImagesPageCode({
  dryRun: dryRunIn,
  likeImagesMin,
  likeImagesMax,
  shouldLikeMedia: shouldLikeMediaIn,
  db,
}: {
  dryRun: boolean;
  likeImagesMin: number;
  likeImagesMax: number;
  shouldLikeMedia: (media: Media) => boolean;
  db: JsonDB;
}) {
  const allImages = Array.from(document.getElementsByTagName("a")).filter(
    (el) => /\/p\//.test(el.href),
  );

  const imagesShuffled = shuffleArray(allImages);

  const numImagesToLike = Math.floor(
    Math.random() * (likeImagesMax + 1 - likeImagesMin) + likeImagesMin,
  );

  logger.log(`Liking ${numImagesToLike} image(s)`);

  const images = imagesShuffled.slice(0, numImagesToLike);

  if (images.length < 1) {
    logger.log("No images to like");
    return;
  }

  for (const image of images) {
    await image.click();

    await sleep({ seconds: 3 });

    const dialog = document.querySelector("*[role=dialog]");

    if (!dialog) throw new Error("Dialog not found");

    const section = Array.from(dialog.querySelectorAll("section")).find(
      (s) =>
        s.querySelectorAll('*[aria-label="Like"]')[0] &&
        s.querySelectorAll('*[aria-label="Comment"]')[0],
    );

    if (!section) throw new Error("Like button section not found");

    const likeButtonChild = section.querySelectorAll('*[aria-label="Like"]')[0];

    if (!likeButtonChild) throw new Error("Like button not found (aria-label)");

    function findClickableParent(el: any) {
      let elAt = el;
      while (elAt) {
        if (elAt.click) {
          return elAt;
        }
        elAt = elAt.parentElement;
      }
      return undefined;
    }

    const foundClickable = findClickableParent(likeButtonChild);

    if (!foundClickable) throw new Error("Like button not found");

    function likeImage() {
      if (
        shouldLikeMediaIn !== null &&
        typeof shouldLikeMediaIn === "function"
      ) {
        const presentation = dialog?.querySelector(
          "article[role=presentation]",
        );
        const img = presentation?.querySelector('img[alt^="Photo by "]');
        const video = presentation?.querySelector('video[type="video/mp4"]');
        const mediaDesc = presentation?.querySelector(
          "[role=menuitem] h2 ~ div",
        )?.textContent;
        let mediaType;
        let src;
        let alt;
        let poster;
        if (img) {
          mediaType = "image";
          ({ src } = img as HTMLImageElement);
          ({ alt } = img as HTMLImageElement);
        } else if (video) {
          mediaType = "video";
          ({ poster } = video as HTMLVideoElement);
          ({ src } = video as HTMLVideoElement);
        } else {
          logger.log("Could not determin mediaType");
        }

        if (
          !shouldLikeMediaIn({
            mediaType,
            mediaDesc,
            src,
            alt,
            poster,
          } as Media)
        ) {
          logger.log(
            `shouldLikeMedia returned false for ${image.href}, skipping`,
          );
          return;
        }
      }

      foundClickable.click();
      onImageLiked({ username: image.href, href: image.href, db });
    }

    if (!dryRunIn) {
      likeImage();
    }

    await sleep({ seconds: 3 });

    const closeButtonChild = document.querySelector('svg[aria-label="Close"]');

    if (!closeButtonChild)
      throw new Error("Close button not found (aria-label)");

    const closeButton = findClickableParent(closeButtonChild);

    if (!closeButton) throw new Error("Close button not found");

    closeButton.click();

    await sleep({ seconds: 5 });
  }

  logger.log("Done liking images");
}

export async function likeUserImages({
  username,
  likeImagesMin = 0,
  likeImagesMax = 0,
  page,
  userDataCache,
  db,
}: {
  username: string;
  likeImagesMin: number;
  likeImagesMax: number;
  page: Page;
  userDataCache: Record<string, User>;
  db: JsonDB;
}) {
  const { likeMediaFilterFn, dryRun } = await getOptions();

  if (
    !likeImagesMin ||
    !likeImagesMax ||
    likeImagesMax < likeImagesMin ||
    likeImagesMin < 1
  )
    throw new Error("Invalid arguments");

  await navigateToUserAndGetData({ username, page, userDataCache });

  logger.log(`Liking ${likeImagesMin}-${likeImagesMax} user images`);
  try {
    await page.exposeFunction("instautoSleep", sleep);
    await page.exposeFunction("instautoLog", (...args: any[]) =>
      console.log(...args),
    );
    await page.exposeFunction("instautoOnImageLiked", (href: string) =>
      onImageLiked({ username, href, db }),
    );
  } catch (err) {
    logger.log("Failed to expose functions", err);
  }

  // TODO: Type correctly
  await page.evaluate(likeCurrentUserImagesPageCode as any, {
    dryRun: dryRun,
    likeImagesMin,
    likeImagesMax,
    shouldLikeMedia: likeMediaFilterFn,
  });
}

export async function onImageLiked({
  username,
  href,
  db,
}: Pick<User, "username" | "href"> & { db: JsonDB }) {
  await db.addLikedPhoto({ username, href, time: new Date().getTime() });
}
