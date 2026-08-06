import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export type GeoSource = "current" | "cached" | "default";
export type GeoErrorCode =
  | "permission_denied"
  | "timeout"
  | "unavailable"
  | "unsupported";

export type GeoReady = {
  status: "ready";
  lat: number;
  lon: number;
  at: number; // ms epoch when captured
  source: GeoSource;
  accuracyM?: number | null;
};

export type GeoError = {
  status: "error";
  code: GeoErrorCode;
  message: string;
  at: number;
};

const LS_GEO_LAST = "srs_geo_last_v1";
const LS_GEO_ERR = "srs_geo_err_v1";

export const GEO_CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30m
const GEO_ERR_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // 7d

// North Andover-ish anchor (only used if we have *nothing*)
const DEFAULT_ANCHOR = { lat: 42.6987, lon: -71.1351 };

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function assertFiniteCoords(lat: unknown, lon: unknown): {
  lat: number;
  lon: number;
} {
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    throw { code: "unavailable", message: "Invalid location coordinates" };
  }
  return { lat, lon };
}
function isFresh(ts: number, maxAgeMs: number) {
  return Date.now() - ts <= maxAgeMs;
}

export function getCachedGeo(maxAgeMs = GEO_CACHE_MAX_AGE_MS): GeoReady | null {
  const cached = readJson<GeoReady>(LS_GEO_LAST);
  if (!cached || cached.status !== "ready") return null;
  if (!isFresh(cached.at, maxAgeMs)) return null;
  return cached;
}

function getRecentGeoError(): GeoError | null {
  const e = readJson<GeoError>(LS_GEO_ERR);
  if (!e || e.status !== "error") return null;
  if (!isFresh(e.at, GEO_ERR_SNOOZE_MS)) return null;
  return e;
}

export function clearGeoCache() {
  try {
    localStorage.removeItem(LS_GEO_LAST);
    localStorage.removeItem(LS_GEO_ERR);
  } catch {}
}

function normalizeError(err: any): GeoError {
  const msg = String(err?.message ?? err ?? "Unknown location error");
  const rawCode = String(err?.code ?? "").toLowerCase();
  const lowerMsg = msg.toLowerCase();

  if (
    rawCode.includes("denied") ||
    lowerMsg.includes("denied") ||
    lowerMsg.includes("not authorized") ||
    lowerMsg.includes("permission")
  ) {
    return {
      status: "error",
      code: "permission_denied",
      message: msg,
      at: Date.now(),
    };
  }

  if (rawCode.includes("timeout") || lowerMsg.includes("timeout")) {
    return { status: "error", code: "timeout", message: msg, at: Date.now() };
  }

  if (
    rawCode.includes("unsupported") ||
    lowerMsg.includes("unsupported") ||
    lowerMsg.includes("not supported")
  ) {
    return {
      status: "error",
      code: "unsupported",
      message: msg,
      at: Date.now(),
    };
  }

  // includes "location services disabled", "unavailable", etc.
  return {
    status: "error",
    code: "unavailable",
    message: msg,
    at: Date.now(),
  };
}

// Timeout wrapper for promises (throws a coded error)
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject({ code: "timeout", message: "timeout" }),
      ms,
    );
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function getCurrentWeb(timeoutMs: number): Promise<GeoReady> {
  if (!("geolocation" in navigator))
    throw { code: "unsupported", message: "unsupported" };

  const pos = await withTimeout(
    new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 10_000,
      });
    }),
    timeoutMs + 250,
  );

  const coords = assertFiniteCoords(pos.coords.latitude, pos.coords.longitude);

  return {
    status: "ready",
    lat: coords.lat,
    lon: coords.lon,
    at: Date.now(),
    source: "current",
    accuracyM:
      typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
  };
}

async function ensureNativePermission(): Promise<void> {
  // Capacitor returns permission states like: "granted" | "denied" | "prompt"
  const current = await Geolocation.checkPermissions();
  const state =
    (current as any)?.location ??
    (current as any)?.coarseLocation ??
    (current as any)?.fineLocation;

  if (state === "granted") return;

  if (state === "prompt" || state == null) {
    const req = await Geolocation.requestPermissions();
    const next =
      (req as any)?.location ??
      (req as any)?.coarseLocation ??
      (req as any)?.fineLocation;
    if (next === "granted") return;
  }

  // If we got here, we are denied (or restricted).
  throw { code: "permission_denied", message: "Location permission denied" };
}

async function getCurrentNative(timeoutMs: number): Promise<GeoReady> {
  await ensureNativePermission();

  const pos = await withTimeout(
    Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: timeoutMs,
      maximumAge: 10_000,
    }),
    timeoutMs + 250,
  );

  const coords = assertFiniteCoords(pos.coords.latitude, pos.coords.longitude);

  return {
    status: "ready",
    lat: coords.lat,
    lon: coords.lon,
    at: Date.now(),
    source: "current",
    accuracyM:
      typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
  };
}

/**
 * Strategy:
 * 1) fresh cache
 * 2) (optional) snooze on permission denied -> cachedAny else default
 * 3) current attempt
 * 4) cachedAny (stale ok)
 * 5) default anchor
 */
export async function resolveGeo(opts?: {
  timeoutMs?: number;
  cacheMaxAgeMs?: number;
  allowSnooze?: boolean;
}): Promise<GeoReady> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const cacheMaxAgeMs = opts?.cacheMaxAgeMs ?? GEO_CACHE_MAX_AGE_MS;
  const allowSnooze = opts?.allowSnooze ?? true;

  // 1) fresh cache
  const fresh = getCachedGeo(cacheMaxAgeMs);
  if (fresh) return { ...fresh, source: "cached" };

  // 2) snooze on recent permission denied
  if (allowSnooze) {
    const recentErr = getRecentGeoError();
    if (recentErr?.code === "permission_denied") {
      const cachedAny = readJson<GeoReady>(LS_GEO_LAST);
      if (cachedAny?.status === "ready")
        return { ...cachedAny, source: "cached" };
      return {
        status: "ready",
        ...DEFAULT_ANCHOR,
        at: Date.now(),
        source: "default",
        accuracyM: null,
      };
    }
  }

  // 3) current attempt
  try {
    const ready = Capacitor.isNativePlatform()
      ? await getCurrentNative(timeoutMs)
      : await getCurrentWeb(timeoutMs);

    writeJson(LS_GEO_LAST, ready);
    // clear error snooze on success
    try {
      localStorage.removeItem(LS_GEO_ERR);
    } catch {}
    return ready;
  } catch (e) {
    const err = normalizeError(e);
    writeJson(LS_GEO_ERR, err);

    // 4) cachedAny (stale ok)
    const cachedAny = readJson<GeoReady>(LS_GEO_LAST);
    if (cachedAny?.status === "ready")
      return { ...cachedAny, source: "cached" };

    // 5) default
    return {
      status: "ready",
      ...DEFAULT_ANCHOR,
      at: Date.now(),
      source: "default",
      accuracyM: null,
    };
  }
}
