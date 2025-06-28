const MIN_TIMEOUT = 2000;

export const doWithTimeout = async (
  fns: (() => Promise<void>)[],
  timeout: number = 2000,
) => {
  for (const [i, fn] of fns.entries()) {
    // Execute the function and wait for it to complete
    await fn();

    // If this isn't the last function, wait for the timeout before the next one
    if (i < fns.length - 1) {
      const randomOffset = Math.random() * timeout * 2 - timeout + MIN_TIMEOUT;
      const randomizedTimeout = timeout + randomOffset;

      await new Promise((resolve) => setTimeout(resolve, randomizedTimeout));
    }
  }
};
