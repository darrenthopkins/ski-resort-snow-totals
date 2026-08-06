export class RequestTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly label: string;

  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "RequestTimeoutError";
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        onTimeout?.();
      } finally {
        reject(new RequestTimeoutError(label, timeoutMs));
      }
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 12_000,
  label = `fetch ${String(input)}`,
): Promise<Response> {
  const controller = new AbortController();
  const request = fetch(input, { ...init, signal: controller.signal }).catch(
    (error) => {
      if (
        error instanceof TypeError &&
        /Expected signal .* instance of AbortSignal/i.test(error.message)
      ) {
        return fetch(input, init);
      }
      throw error;
    },
  );

  return withTimeout(request, timeoutMs, label, () => controller.abort());
}
