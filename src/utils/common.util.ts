export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const retry = async <T>(
  fn: (retries: number, maxRetries: number) => Promise<T>,
  maxRetries = 3,
  delay = 1000,
) => {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await fn(retries, maxRetries);
    } catch (error) {
      console.error(`Retry ${retries + 1} failed:`, error);
      retries++;
      await sleep(delay);
    }
  }
  throw new Error('Retry failed');
};
