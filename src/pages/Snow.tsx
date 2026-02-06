import {
  IonBadge,
  IonButton,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { useEffect, useMemo, useState } from "react";
import "./Snow.css";
import { RESORTS } from "../data/resorts";
import { haversineMiles } from "../lib/geo";
import { snowService } from "../services/snow";
import type { SnowMetrics } from "../services/snow/types";
import { todayISO } from "../lib/date";
import { buildWeekPlan } from "../lib/weekPlanner";

const MAX_MILES = 110;

const FALLBACK_DRIVE_MILES: Record<string, number> = {
  patspeak: 47,
  gunstock: 61,
  sunapee: 65,
  ragged: 70,
  waterville: 89,
};

// ---- Location persistence ----
const LS_GEO_LAST = "srs_geo_last_v1";
const LS_GEO_ERR = "srs_geo_err_v1";

const GEO_CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const GEO_ERR_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type GeoReady = { status: "ready"; lat: number; lon: number; at: number };
type GeoError = { status: "error"; message: string; at: number };
type GeoState = { status: "idle" | "loading" } | GeoReady | GeoError;

function fmtInches(v: number | null) {
  return v === null ? "—" : `${v}"`;
}
function fmtMiles(v: number) {
  return `${Math.round(v)} mi`;
}

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
  } catch {
    // ignore
  }
}

function isFresh(ts: number, maxAgeMs: number) {
  return Date.now() - ts <= maxAgeMs;
}

function getCachedGeo(): GeoReady | null {
  const cached = readJson<GeoReady>(LS_GEO_LAST);
  if (!cached) return null;
  if (cached.status !== "ready") return null;
  if (!isFresh(cached.at, GEO_CACHE_MAX_AGE_MS)) return null;
  return cached;
}

function getRecentGeoError(): GeoError | null {
  const cached = readJson<GeoError>(LS_GEO_ERR);
  if (!cached) return null;
  if (cached.status !== "error") return null;
  if (!isFresh(cached.at, GEO_ERR_SNOOZE_MS)) return null;
  return cached;
}

export default function Snow() {
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });

  // snow data loaded via service abstraction
  const [snowById, setSnowById] = useState<Record<string, SnowMetrics>>({});
  const [snowLoading, setSnowLoading] = useState<boolean>(true);

  useEffect(() => {
    // 1) Use cached location if fresh (no prompt)
    const cachedGeo = getCachedGeo();
    if (cachedGeo) {
      setGeo(cachedGeo);
      return;
    }

    // 2) If user recently denied/errored, don't auto-prompt again
    const recentErr = getRecentGeoError();
    if (recentErr) {
      setGeo(recentErr);
      return;
    }

    // 3) Otherwise request once
    if (!("geolocation" in navigator)) {
      const err: GeoError = {
        status: "error",
        message: "Geolocation not supported in this environment.",
        at: Date.now(),
      };
      writeJson(LS_GEO_ERR, err);
      setGeo(err);
      return;
    }

    setGeo({ status: "loading" });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ok: GeoReady = {
          status: "ready",
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          at: Date.now(),
        };
        writeJson(LS_GEO_LAST, ok);
        setGeo(ok);
      },
      (e) => {
        const err: GeoError = {
          status: "error",
          message: e.message || "Location permission denied or unavailable.",
          at: Date.now(),
        };
        writeJson(LS_GEO_ERR, err);
        setGeo(err);
      },
      {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 60_000,
      },
    );
  }, []);

  const resortsWithMiles = useMemo(() => {
    if (geo.status !== "ready") {
      return RESORTS.map((r) => ({ resort: r, miles: null as number | null }));
    }

    const here = { lat: geo.lat, lon: geo.lon };
    return RESORTS.map((r) => ({
      resort: r,
      miles: haversineMiles(here, { lat: r.lat, lon: r.lon }),
    }))
      .filter((x) => x.miles <= MAX_MILES)
      .sort((a, b) => a.miles - b.miles);
  }, [geo]);

  const driveMilesById = useMemo(() => {
    // Start with fallbacks so the planner still works when location is off.
    const m: Record<string, number> = { ...FALLBACK_DRIVE_MILES };

    // If we have computed miles, override fallbacks with real values.
    for (const row of resortsWithMiles) {
      const id = row.resort.id;
      const miles = row.miles;
      if (
        typeof id === "string" &&
        typeof miles === "number" &&
        Number.isFinite(miles) &&
        miles > 0
      ) {
        m[id] = miles;
      }
    }

    return m;
  }, [resortsWithMiles]);

  const outlook = useMemo(() => {
    if (snowLoading) return null;
    if (!snowById || Object.keys(snowById).length === 0) return null;
    return buildWeekPlan({
      resorts: RESORTS,
      metricsByResortId: snowById,
      startDateISO: todayISO(),
      days: 7,
      topNPerDay: 3,
      driveMilesByResortId: driveMilesById,
    });
  }, [snowLoading, snowById]);

  // Load snow data via service abstraction (mock for now)
  useEffect(() => {
    let alive = true;
    (async () => {
      setSnowLoading(true);
      try {
        const result = await snowService.getSnow({
          resorts: resortsWithMiles.map((x) => x.resort),
        });
        if (!alive) return;
        setSnowById(result);
      } finally {
        if (!alive) {
          setSnowLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [resortsWithMiles]);

  const headerNote = useMemo(() => {

function retryLocation() {
  try {
    localStorage.removeItem(LS_GEO_ERR);
    localStorage.removeItem(LS_GEO_LAST);
  } catch {
    // ignore
  }
  window.location.reload();
}

    if (geo.status === "loading")
      return <IonNote>Getting your location…</IonNote>;
    if (geo.status === "ready")
      return (
        <IonNote>
          Using location: {geo.lat.toFixed(4)}, {geo.lon.toFixed(4)}
        </IonNote>
      );
    if (geo.status === "error")
      return (
        <IonNote color="warning">
          Location off: {geo.message} (showing all resorts)
          <IonButton
            size="small"
            fill="outline"
            style={{ marginLeft: 8 }}
            onClick={retryLocation}
          >
            Retry
          </IonButton>
        </IonNote>
      );
    return null;
  }, [geo]);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Snow Totals</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {outlook && (
          <IonList inset={true}>
            <IonItem>
              <IonLabel>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <div style={{ fontWeight: 600 }}>
                    Best day (v0): {outlook.bestDay.dateISO}
                  </div>
                  <div>
                    Best resort: {outlook.bestDay.best.resortName} -{" "}
                    {outlook.bestDay.best.result.label.toUpperCase()} (
                    {outlook.bestDay.best.result.score})
                  </div>
                </div>
              </IonLabel>
            </IonItem>
          </IonList>
        )}

        <IonList inset={true}>
          <IonItem>
            <IonLabel>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <strong>Filter</strong>
                <IonBadge>{MAX_MILES} miles</IonBadge>
                {headerNote}
              </div>
            </IonLabel>
          </IonItem>
        </IonList>

        <IonList inset={true}>
          <IonItem lines="full">
            <IonLabel className="snowHeader">
              <div className="snowHeaderRow">
                <span className="colResort">Resort</span>
                <span className="colNum">Last 48h</span>
                <span className="colNum">Next 24h</span>
                <span className="colUpdated">Updated</span>
              </div>
            </IonLabel>
          </IonItem>

          {snowLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <IonItem key={`sk-${i}`}>
                  <IonLabel>
                    <div className="snowRow">
                      <span className="colResort">
                        <IonSkeletonText
                          animated={true}
                          style={{ width: "60%" }}
                        />
                      </span>
                      <span className="colNum">
                        <IonSkeletonText
                          animated={true}
                          style={{ width: "40px", marginLeft: "auto" }}
                        />
                      </span>
                      <span className="colNum">
                        <IonSkeletonText
                          animated={true}
                          style={{ width: "40px", marginLeft: "auto" }}
                        />
                      </span>
                      <span className="colUpdated">
                        <IonSkeletonText
                          animated={true}
                          style={{ width: "70px", marginLeft: "auto" }}
                        />
                      </span>
                    </div>
                  </IonLabel>
                </IonItem>
              ))
            : resortsWithMiles.map(({ resort, miles }) => {
                const snow = snowById[resort.id] ?? {
                  last48In: null,
                  next24In: null,
                  updatedAt: "—",
                };

                return (
                  <IonItem key={resort.id}>
                    <IonLabel>
                      <div className="snowRow">
                        <span className="colResort">
                          {resort.name}
                          {miles !== null ? (
                            <IonNote style={{ marginLeft: 8 }}>
                              {fmtMiles(miles)}
                            </IonNote>
                          ) : null}
                        </span>
                        <span className="colNum">
                          {fmtInches(snow.last48In)}
                        </span>
                        <span className="colNum">
                          {fmtInches(snow.next24In)}
                        </span>
                        <IonNote className="colUpdated" slot="end">
                          {snow.last48Meta?.updatedAt ??
                            snow.next24Meta?.updatedAt ??
                            "—"}
                        </IonNote>
                      </div>
                    </IonLabel>
                  </IonItem>
                );
              })}
        </IonList>
      </IonContent>
    </IonPage>
  );
}
