export const doWithTimeout = async (
  fn: Promise<void>,
  timeout: number | undefined = 2000,
) => {
  // Generate a random offset between -2000 and +2000
  const randomOffset = Math.random() * 4000 - 2000;
  const randomizedTimeout = timeout + randomOffset;

  setTimeout(async () => {
    return await fn;
  }, randomizedTimeout);
};
