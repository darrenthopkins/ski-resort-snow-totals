export type FetchFailureKind =
  | "timeout"
  | "worker_http"
  | "upstream_http"
  | "network"
  | "parse"
  | "unknown";

export type FetchDiagnostic = {
  kind: FetchFailureKind;
  provider: string;
  endpoint: string;
  status?: number;
  statusText?: string;
  upstreamStatus?: string | null;
  contentType?: string | null;
  message: string;
};

export class FetchDiagnosticError extends Error {
  readonly diagnostic: FetchDiagnostic;

  constructor(diagnostic: FetchDiagnostic) {
    super(
      `${diagnostic.provider} ${diagnostic.kind} ${diagnostic.endpoint}: ${diagnostic.message}`,
    );
    this.name = "FetchDiagnosticError";
    this.diagnostic = diagnostic;
  }
}

export function sanitizeEndpoint(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return raw.split("?")[0] ?? raw;
  }
}

export function summarizeFetchError(error: unknown): FetchDiagnostic | null {
  const diagnostic = (error as any)?.diagnostic;
  if (diagnostic && typeof diagnostic === "object") {
    return diagnostic as FetchDiagnostic;
  }

  const message = String((error as any)?.message ?? error ?? "Unknown error");
  if ((error as any)?.name === "RequestTimeoutError") {
    return {
      kind: "timeout",
      provider: "unknown",
      endpoint: String((error as any)?.label ?? "unknown"),
      message,
    };
  }
  if (
    message.includes("Failed to fetch") ||
    message.includes("Load failed") ||
    message.includes("NetworkError")
  ) {
    return {
      kind: "network",
      provider: "unknown",
      endpoint: "unknown",
      message,
    };
  }
  return null;
}

export function formatFetchDiagnostic(error: unknown): string {
  const diagnostic = summarizeFetchError(error);
  if (!diagnostic) return String((error as any)?.message ?? error);

  const status = diagnostic.status
    ? ` status=${diagnostic.status}`
    : diagnostic.upstreamStatus
    ? ` upstream=${diagnostic.upstreamStatus}`
    : "";
  const contentType = diagnostic.contentType
    ? ` contentType=${diagnostic.contentType}`
    : "";
  return `${diagnostic.provider} ${diagnostic.kind}${status}${contentType} ${diagnostic.endpoint}: ${diagnostic.message}`;
}
