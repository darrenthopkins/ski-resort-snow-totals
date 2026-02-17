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
type MetricStatus = "measured" | "derived" | "missing";
type MetricMeta = {
  status: MetricStatus;
  source?: string;
  sourceUrl?: string;
  updatedAt?: string;
};

function getIndicator(meta?: MetricMeta | null, value?: number | null) {
  // Back-compat: if meta missing, treat null as missing
  if (!meta) return value == null ? { kind: "warn" as const } : null;

  if (meta.status === "missing") return { kind: "warn" as const };
  if (meta.status === "derived") return { kind: "info" as const };
  return null; // measured
}

function metricTooltip(
  metric: "Last 48h" | "Next 24h",
  meta?: MetricMeta | null,
) {
  if (!meta) return "No metadata available.";

  if (meta.status === "missing")
    return `Missing ${metric.toLowerCase()} input.`;
  if (meta.status === "derived") {
    // Your requested “short but sophisticated”
    if (metric === "Next 24h")
      return "NWS-derived gridpoint forecast (not resort-reported).";
    return "Derived from resort site data (parsed, not manually verified).";
  }

  // measured
  if (metric === "Next 24h") return "NWS forecast.";
  return "Resort-reported snowfall.";
}

function fmtInches(v: number | null) {
  return v === null ? "—" : `${v}"`;
}
function fmtMiles(v: number) {
  return `${Math.round(v)} mi`;
}
function firstNonNull<T>(xs: Array<T | null | undefined>): T | null {
  for (const x of xs) if (x != null) return x;
  return null;
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

  function refreshSnow() {
    try {
      localStorage.removeItem("srs_snow_cache_v1");
    } catch {
      // ignore
    }
    window.location.reload();
  }
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

  const resortIdsKey = useMemo(() => {
    return resortsWithMiles
      .map((x) => x.resort.id)
      .sort()
      .join(",");
  }, [resortsWithMiles]);

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

  function retryLocation() {
    try {
      localStorage.removeItem(LS_GEO_ERR);
      localStorage.removeItem(LS_GEO_LAST);
    } catch {
      // ignore
    }
    window.location.reload();
  }

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
    setSelectedDateISO(
      (prev) =>
        prev ??
        weekVM.summary.decision.window.startISO ??
        weekVM.days[0]?.dateISO ??
        null,
    );
  }, [weekVM]);

  const selectedDay = useMemo(() => {
    if (!weekVM) return null;
    const key =
      selectedDateISO ??
      weekVM.summary.decision.window.startISO ??
      weekVM.days[0]?.dateISO ??
      null;

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

  function shortTimeStamp(s: string | null | undefined): string | null {
    if (!s) return null;
    // If it's already a locale string, keep it. Otherwise try parsing.
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, {
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
    return s;
  }

  function fmtMonthDay(dateISO: string): string {
    const [y, m, d] = dateISO.split("-").map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function labelPhrase(label: "green" | "yellow" | "red") {
    if (label === "green") return "Go";
    if (label === "yellow") return "Wait / Watch";
    return "Skip";
  }

  function sameResortCopy(overall: "green" | "yellow" | "red") {
    if (overall === "green") return "Go both days";
    if (overall === "yellow") return "Same resort both days";
    return "Stick to one resort (if you go)";
  }

  function rollupLabel(
    labels: Array<"green" | "yellow" | "red">,
  ): "green" | "yellow" | "red" {
    if (labels.includes("red")) return "red";
    if (labels.includes("yellow")) return "yellow";
    return "green";
  }

  const resortsForFetch = useMemo(
    () => resortsWithMiles.map((x) => x.resort),
    [resortsWithMiles], // key controls when this changes
  );

  // Load snow data via service abstraction (mock for now)
  useEffect(() => {
    let alive = true;
    (async () => {
      setSnowLoading(true);
      try {
        const result = await snowService.getSnow({
          resorts: resortsForFetch,
        });
        if (!alive) return;
        setSnowById(result);
      } finally {
        if (alive) setSnowLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [resortsForFetch]);

  const headerNote = useMemo(() => {
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
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {(() => {
                    const decision = weekVM.summary.decision;
                    const picks = decision.picks ?? [];
                    const pickResortIds = Array.from(
                      new Set(picks.map((p) => p.resortId)),
                    );

                    const next24 =
                      pickResortIds
                        .map((id) => snowById[id]?.next24Meta?.updatedAt)
                        .find((x) => x != null) ?? null;

                    const last48 =
                      pickResortIds
                        .map((id) => snowById[id]?.last48Meta?.updatedAt)
                        .find((x) => x != null) ?? null;

                    const provenanceLine =
                      next24 || last48
                        ? [
                            next24 ? `NWS ${shortTimeStamp(next24)}` : null,
                            last48 ? `Resort ${shortTimeStamp(last48)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : null;

                    const labels = picks.map((p) => p.label);
                    const overall = rollupLabel(labels);
                    const overallColors = labelColors(overall);

                    const sameResort =
                      picks.length >= 2 &&
                      picks.every((p) => p.resortId === picks[0].resortId);

                    const windowText = decision.window?.label
                      ? `${decision.window.label} (${fmtMonthDay(decision.window.startISO)}–${fmtMonthDay(decision.window.endISO)})`
                      : `${fmtMonthDay(picks[0]?.dateISO ?? decision.window.startISO)}–${fmtMonthDay(picks[picks.length - 1]?.dateISO ?? decision.window.endISO)}`;

                    return (
                      <div
                        style={{
                          borderRadius: 16,
                          padding: 14,
                          background: "#ffffff08",
                          border: "1px solid #ffffff1f",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {/* Header */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 800,
                              opacity: 0.85,
                            }}
                          >
                            Feb vacation plan
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.6 }}>
                            {windowText}
                          </div>
                        </div>
                        {provenanceLine ? (
                          <div
                            style={{
                              fontSize: 11,
                              opacity: 0.55,
                              marginTop: -6,
                            }}
                          >
                            {provenanceLine}
                          </div>
                        ) : null}

                        {/* Primary recommendation */}
                        {sameResort ? (
                          <>
                            <div
                              style={{
                                fontSize: 24,
                                fontWeight: 900,
                                lineHeight: 1.1,
                              }}
                            >
                              {picks[0]?.resortName ?? "—"}
                            </div>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 700,
                                opacity: 0.75,
                              }}
                            >
                              {sameResortCopy(overall)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div
                              style={{
                                fontSize: 18,
                                fontWeight: 900,
                                lineHeight: 1.15,
                              }}
                            >
                              {picks.length > 0 ? "Plan" : "No plan yet"}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                              }}
                            >
                              {picks.slice(0, 2).map((p) => {
                                const c = labelColors(p.label);
                                return (
                                  <div
                                    key={p.dateISO + p.resortId}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: 10,
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        flexDirection: "column",
                                      }}
                                    >
                                      <div style={{ fontWeight: 800 }}>
                                        {dayOfWeekShort(p.dateISO)} ·{" "}
                                        {p.resortName}
                                      </div>
                                      <div
                                        style={{ fontSize: 12, opacity: 0.7 }}
                                      >
                                        {fmtMonthDay(p.dateISO)}
                                      </div>
                                    </div>

                                    <div
                                      style={{
                                        display: "inline-flex",
                                        padding: "6px 10px",
                                        borderRadius: 999,
                                        background: c.bg,
                                        border: `1px solid ${c.border}`,
                                        fontWeight: 900,
                                        fontSize: 12,
                                        letterSpacing: 0.2,
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {labelPhrase(p.label)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}

                        {/* Overall confidence chip */}
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <div
                            style={{
                              display: "inline-flex",
                              padding: "6px 10px",
                              borderRadius: 999,
                              background: overallColors.bg,
                              border: `1px solid ${overallColors.border}`,
                              fontWeight: 900,
                              fontSize: 12,
                              letterSpacing: 0.2,
                            }}
                          >
                            {labelPhrase(overall)}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              opacity: 0.7,
                              alignSelf: "center",
                            }}
                          >
                            {picks.length} day{picks.length === 1 ? "" : "s"} ·{" "}
                            {sameResort ? "single resort" : "multi resort"}
                          </div>
                        </div>

                        {/* Why bullets */}
                        {decision.why?.length ? (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              marginTop: 2,
                            }}
                          >
                            {decision.why.slice(0, 3).map((b, i) => (
                              <div
                                key={i}
                                style={{ fontSize: 14, opacity: 0.9 }}
                              >
                                • {b}
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {/* Backup */}
                        {decision.backup ? (
                          <div style={{ marginTop: 2 }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 800,
                                opacity: 0.65,
                              }}
                            >
                              Backup
                            </div>
                            <div style={{ fontSize: 14 }}>
                              <strong>{decision.backup.resortName}</strong>
                              <span style={{ opacity: 0.85 }}>
                                {" "}
                                — {decision.backup.reason}
                              </span>
                            </div>
                          </div>
                        ) : null}

                        {/* CTA Row */}
                        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                          <IonButton expand="block" style={{ flex: 1 }}>
                            Directions
                          </IonButton>
                          <IonButton
                            expand="block"
                            fill="outline"
                            style={{ flex: 1 }}
                          >
                            Share plan
                          </IonButton>
                          <IonButton
                            expand="block"
                            fill="outline"
                            style={{ flex: 1 }}
                            onClick={refreshSnow}
                          >
                            Refresh data
                          </IonButton>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Timeline strip (v0) */}
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      overflowX: "auto",
                      paddingBottom: 8,
                      WebkitOverflowScrolling: "touch",
                    }}
                  >
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
                            background: isSelected
                              ? "#ffffff10"
                              : "transparent",
                            padding: 10,
                            minWidth: 140,
                          }}
                          title={`${d.dateISO} • ${d.topPick.resortName} • ${d.topPick.score}`}
                          aria-label={`Select ${d.dateISO}`}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                              }}
                            >
                              <div style={{ fontSize: 12, opacity: 0.9 }}>
                                {dayOfWeekShort(d.dateISO)}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.8 }}>
                                {d.dateISO}
                              </div>
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

                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                              }}
                            >
                              <div
                                style={{ fontWeight: 700, lineHeight: 1.15 }}
                              >
                                {d.topPick.resortName}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.85 }}>
                                Score:{" "}
                                <span style={{ fontWeight: 700 }}>
                                  {d.topPick.score}
                                </span>
                              </div>
                            </div>

                            {d.runnersUp.length > 0 && (
                              <div style={{ fontSize: 12, opacity: 0.75 }}>
                                Next:{" "}
                                {d.runnersUp
                                  .map((r) => r.resortName)
                                  .join(", ")}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected day details */}
                  {selectedDay && (
                    <div
                      style={{
                        marginTop: 6,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>
                        {dayOfWeekShort(selectedDay.dateISO)}{" "}
                        {selectedDay.dateISO} —{" "}
                        {selectedDay.label.toUpperCase()} (
                        {selectedDay.topPick.score})
                      </div>

                      <div>
                        <strong>Top pick:</strong>{" "}
                        {selectedDay.topPick.resortName}
                      </div>

                      {selectedDay.runnersUp.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
                          <strong>Runners up:</strong>
                          <div style={{ opacity: 0.9 }}>
                            {selectedDay.runnersUp.map((r) => (
                              <div key={r.resortId}>
                                • {r.resortName} — {r.label.toUpperCase()} (
                                {r.score})
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedDay.bullets.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                          }}
                        >
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
                <IonButton
                  size="small"
                  fill="outline"
                  onClick={() => {
                    try {
                      localStorage.removeItem("srs_snow_cache_v1");
                    } catch {}
                    window.location.reload();
                  }}
                >
                  Refresh data
                </IonButton>
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
                if (resort.id === "ragged") {
                  console.log("[ui] ragged snow object", snow);
                }

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
                          {(() => {
                            const ind = getIndicator(
                              snow.last48Meta,
                              snow.last48In,
                            );
                            if (!ind) return null;
                            return (
                              <span
                                title={metricTooltip(
                                  "Last 48h",
                                  snow.last48Meta,
                                )}
                              >
                                {ind.kind === "warn" ? " (!)" : " (i)"}
                              </span>
                            );
                          })()}
                        </span>

                        <span className="colNum">
                          {fmtInches(snow.next24In)}
                          {(() => {
                            const ind = getIndicator(
                              snow.next24Meta,
                              snow.next24In,
                            );
                            if (!ind) return null;
                            return (
                              <span
                                title={metricTooltip(
                                  "Next 24h",
                                  snow.next24Meta,
                                )}
                              >
                                {ind.kind === "warn" ? " (!)" : " (i)"}
                              </span>
                            );
                          })()}
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
