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
import { buildWeekPlanViewModel } from "../lib/weekPlannerViewModel";

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
  }, [snowLoading, snowById, driveMilesById]);
  const weekVM = useMemo(() => {
    if (!outlook) return null;
    return buildWeekPlanViewModel({
      outlook,
      resorts: RESORTS,
      driveMilesByResortId: driveMilesById,
    });
  }, [outlook, driveMilesById]);

  // --- Week timeline selection (v0) ---
  const [selectedDateISO, setSelectedDateISO] = useState<string | null>(null);

  useEffect(() => {
    if (!weekVM) return;
    setSelectedDateISO((prev) => prev ?? weekVM.summary.bestWindow.startISO ?? weekVM.days[0]?.dateISO ?? null);
  }, [weekVM]);

  const selectedDay = useMemo(() => {
    if (!weekVM) return null;
    const key = selectedDateISO ?? weekVM.summary.bestWindow.startISO ?? weekVM.days[0]?.dateISO ?? null;
    if (!key) return null;
    return weekVM.days.find((d) => d.dateISO === key) ?? weekVM.days[0] ?? null;
  }, [weekVM, selectedDateISO]);

  function dayOfWeekShort(dateISO: string): string {
    const [y, m, d] = dateISO.split("-").map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    return dt.toLocaleDateString(undefined, { weekday: "short" });
  }

  function labelColors(label: "green" | "yellow" | "red") {
    if (label === "green") return { bg: "#1f7a1f", border: "#2aa52a" };
    if (label === "red") return { bg: "#7a1f1f", border: "#a52a2a" };
    return { bg: "#7a5a1f", border: "#a57b2a" };
  }






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
        {weekVM && (
          <IonList inset={true}>
            <IonItem>
              <IonLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Week plan (v0)</div>
                  <div><strong>Best window:</strong> {weekVM.summary.bestWindow.label}</div>
                  <div><strong>Best overall:</strong> {weekVM.summary.bestOverallResort.name}</div>
                  <div><strong>Backup:</strong> {weekVM.summary.backupResort.name} — {weekVM.summary.backupResort.reason}</div>
                  <div style={{ opacity: 0.85 }}>{weekVM.summary.narrative}</div>

                  {/* Timeline strip (v0) */}
                  <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, WebkitOverflowScrolling: "touch" }}>
                    {weekVM.days.map((d) => {
                      const isSelected = d.dateISO === selectedDay?.dateISO;
                      const c = labelColors(d.label);
                      return (
                        <button
                          key={d.dateISO}
                          onClick={() => setSelectedDateISO(d.dateISO)}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            flex: "0 0 auto",
                            borderRadius: 14,
                            border: `1px solid ${isSelected ? "#ffffff55" : "#ffffff22"}`,
                            background: isSelected ? "#ffffff10" : "transparent",
                            padding: 10,
                            minWidth: 140,
                          }}
                          title={`${d.dateISO} • ${d.topPick.resortName} • ${d.topPick.score}`}
                          aria-label={`Select ${d.dateISO}`}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ fontSize: 12, opacity: 0.9 }}>{dayOfWeekShort(d.dateISO)}</div>
                              <div style={{ fontSize: 12, opacity: 0.8 }}>{d.dateISO}</div>
                            </div>

                            <div
                              style={{
                                display: "inline-flex",
                                alignSelf: "flex-start",
                                padding: "6px 10px",
                                borderRadius: 999,
                                background: c.bg,
                                border: `1px solid ${c.border}`,
                                fontWeight: 800,
                                fontSize: 12,
                                letterSpacing: 0.3,
                              }}
                            >
                              {d.label.toUpperCase()}
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <div style={{ fontWeight: 700, lineHeight: 1.15 }}>{d.topPick.resortName}</div>
                              <div style={{ fontSize: 12, opacity: 0.85 }}>
                                Score: <span style={{ fontWeight: 700 }}>{d.topPick.score}</span>
                              </div>
                            </div>

                            {d.runnersUp.length > 0 && (
                              <div style={{ fontSize: 12, opacity: 0.75 }}>
                                Next: {d.runnersUp.map((r) => r.resortName).join(", ")}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected day details */}
                  {selectedDay && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ fontWeight: 800 }}>
                        {dayOfWeekShort(selectedDay.dateISO)} {selectedDay.dateISO} — {selectedDay.label.toUpperCase()} ({selectedDay.topPick.score})
                      </div>

                      <div><strong>Top pick:</strong> {selectedDay.topPick.resortName}</div>

                      {selectedDay.runnersUp.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <strong>Runners up:</strong>
                          <div style={{ opacity: 0.9 }}>
                            {selectedDay.runnersUp.map((r) => (
                              <div key={r.resortId}>• {r.resortName} — {r.label.toUpperCase()} ({r.score})</div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedDay.bullets.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <strong>Why:</strong>
                          <div style={{ opacity: 0.9 }}>
                            {selectedDay.bullets.map((b, i) => (
                              <div key={i}>• {b}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
