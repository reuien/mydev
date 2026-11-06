// Retry only safe reads and recognizable transient D1 failures, once.
// Missing schema, invalid SQL and constraints require a fix, not a retry loop.
export async function readD1<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); } catch (error) {
    if (!(error instanceof Error) || !/timeout|timed out|temporarily unavailable|overloaded|connection reset|network error|internal error|D1_EXEC_ERROR.*retry/i.test(error.message)) {
      throw error;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    return read();
  }
}
