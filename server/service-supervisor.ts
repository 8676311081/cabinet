interface SuperviseServiceOptions {
  signal?: AbortSignal;
  maxBackoffMs?: number;
  onCrash?: (err: unknown) => void | Promise<void>;
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack || `${err.name}: ${err.message}`;
  }
  return String(err);
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      resolve();
    };

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function superviseService(
  name: string,
  startFn: (signal: AbortSignal) => Promise<void>,
  options: SuperviseServiceOptions = {},
): Promise<void> {
  const signal = options.signal ?? new AbortController().signal;
  const maxBackoffMs = options.maxBackoffMs ?? 60_000;
  let backoffMs = 1_000;

  while (!signal.aborted) {
    try {
      await startFn(signal);
      if (!signal.aborted) {
        throw new Error(`Service "${name}" exited unexpectedly`);
      }
      return;
    } catch (err) {
      if (signal.aborted) {
        return;
      }

      console.error(`[supervisor:${name}] service crashed:\n${formatError(err)}`);
      await options.onCrash?.(err);

      if (signal.aborted) {
        return;
      }

      console.log(`[supervisor:${name}] restarting in ${backoffMs}ms`);
      await wait(backoffMs, signal);
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
    }
  }
}
