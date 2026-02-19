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
import { IonIcon } from "@ionic/react";
import {
  snowOutline,
  partlySunnyOutline,
  carOutline,
  navigateOutline,
  shareOutline,
  refreshOutline,
} from "ionicons/icons";

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

function addDaysISO(startISO: string, days: number): string {
  const d = new Date(startISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDow(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
  });
}

function formatMD(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

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
      localStorage.removeItem("srs_geo_last_v1");
      localStorage.removeItem("srs_geo_err_v1");
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

  useEffect(() => {
    if (selectedDateISO) return;
    if (!weekVM?.days?.length) return;

    const best = weekVM.days.reduce((a, b) =>
      b.topPick.score > a.topPick.score ? b : a,
    );

    setSelectedDateISO(best.dateISO);
  }, [weekVM, selectedDateISO, setSelectedDateISO]);

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

  const [selectedDayISO, setSelectedDayISO] = useState<string>(() => {
    return localStorage.getItem("srs_selected_day_iso") ?? "";
  });

  useEffect(() => {
    if (selectedDateISO) return;
    if (!weekVM) return;

    // Preferred: if you have per-day objects already (selectedDay model), use them.
    // Otherwise: use decision.picks.
    const decision = weekVM.summary?.decision;
    const picks = decision?.picks ?? [];

    if (!picks.length) return;

    // Choose "best" by score among picks. If score is missing, just take first.
    const best = picks.reduce((a: any, b: any) => (b.score > a.score ? b : a));
    const iso = best.dateISO ?? decision?.window?.startISO ?? null;

    if (iso) setSelectedDateISO(iso);
  }, [weekVM, selectedDateISO, setSelectedDateISO]);

  useEffect(() => {
    if (selectedDayISO)
      localStorage.setItem("srs_selected_day_iso", selectedDayISO);
  }, [selectedDayISO]);

  const nextDayISO = useMemo(() => {
    if (!selectedDayISO) return "";
    return addDaysISO(selectedDayISO, 1);
  }, [selectedDayISO]);

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

                    // ✅ single-day hero: selected day topPick (fallback to decision pick)
                    const primaryPick =
                      selectedDay?.topPick ?? decision.picks?.[0] ?? null;
                    const heroDateISO =
                      selectedDay?.dateISO ?? decision.window?.startISO ?? null;

                    const headline = heroDateISO
                      ? `Best for ${dayOfWeekShort(heroDateISO)} (${fmtMonthDay(heroDateISO)})`
                      : decision.window?.label
                        ? `${decision.window.label} (${fmtMonthDay(decision.window.startISO)}–${fmtMonthDay(decision.window.endISO)})`
                        : "Best for —";

                    const primaryResortId = primaryPick?.resortId ?? null;

                    const next24Updated =
                      (primaryResortId
                        ? snowById[primaryResortId]?.next24Meta?.updatedAt
                        : null) ?? null;

                    const last48Updated =
                      (primaryResortId
                        ? snowById[primaryResortId]?.last48Meta?.updatedAt
                        : null) ?? null;

                    const provenanceLine =
                      next24Updated || last48Updated
                        ? [
                            next24Updated
                              ? `NWS ${shortTimeStamp(next24Updated)}`
                              : null,
                            last48Updated
                              ? `Resort ${shortTimeStamp(last48Updated)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : null;

                    const overall = primaryPick?.label ?? "skip";
                    const overallColors = labelColors(overall);

                    // Prefer selected-day bullets, fallback to model-wide why
                    const whyBullets =
                      (selectedDay?.bullets?.length
                        ? selectedDay.bullets
                        : (decision.why ?? [])) ?? [];

                    // Friendly formatting for known bullet types (no planner changes)
                    function renderWhyRow(b: string, i: number) {
                      const text = String(b ?? "");

                      // Snow signal line: replace confusing suffix
                      // Snow window line (icon-only, no "Snow signal" text)
                      if (text.toLowerCase().startsWith("snow signal:")) {
                        // Extract numeric portion (e.g. "8\"")
                        const match = text.match(/(\d+(\.\d+)?")/);
                        const snowValue = match ? match[1] : "";

                        // Build friendly window label using heroDateISO
                        const winStartISO = heroDateISO;
                        const winEndISO = addDaysISO(heroDateISO, 1);

                        const winLabel = `${dayOfWeekShort(winStartISO)} → ${dayOfWeekShort(
                          winEndISO,
                        )}`;

                        return (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              fontSize: 14,
                              opacity: 0.95,
                            }}
                          >
                            <IonIcon
                              icon={snowOutline}
                              style={{ fontSize: 18, opacity: 0.9 }}
                              aria-hidden="true"
                            />

                            <span style={{ fontWeight: 800 }}>
                              {snowValue || "—"}
                            </span>

                            <span style={{ opacity: 0.75 }}>{winLabel}</span>
                          </div>
                        );
                      }

                      // Weather-ish line: anything containing °F
                      if (
                        text.includes("°F") ||
                        text.toLowerCase().includes("wind")
                      ) {
                        return (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              fontSize: 14,
                              opacity: 0.92,
                            }}
                          >
                            <IonIcon
                              icon={partlySunnyOutline}
                              style={{ fontSize: 18, opacity: 0.85 }}
                              aria-hidden="true"
                            />
                            <span>{text}</span>
                          </div>
                        );
                      }

                      // Drive line
                      if (text.toLowerCase().startsWith("drive")) {
                        return (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              fontSize: 14,
                              opacity: 0.92,
                            }}
                          >
                            <IonIcon
                              icon={carOutline}
                              style={{ fontSize: 18, opacity: 0.85 }}
                              aria-hidden="true"
                            />
                            <span>{text}</span>
                          </div>
                        );
                      }

                      // Default fallback (still no bullet dot)
                      return (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            fontSize: 14,
                            opacity: 0.92,
                          }}
                        >
                          <span style={{ width: 18 }} />
                          <span>{text}</span>
                        </div>
                      );
                    }

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
                          <div style={{ fontSize: 12, opacity: 0.75 }}>
                            {headline}
                          </div>
                        </div>

                        {/* Provenance */}
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
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 24,
                              fontWeight: 900,
                              lineHeight: 1.1,
                            }}
                          >
                            {primaryPick?.resortName ?? "—"}
                          </div>

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
                              whiteSpace: "nowrap",
                            }}
                          >
                            {labelPhrase(overall)}
                          </div>
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

                        {/* Why rows (optional) */}
                        {whyBullets.length ? (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              marginTop: 2,
                            }}
                          >
                            {whyBullets.slice(0, 3).map(renderWhyRow)}
                          </div>
                        ) : null}

                        {/* Backup (single line) */}
                        {decision.backup ? (
                          <div
                            style={{
                              marginTop: 2,
                              fontSize: 12,
                              opacity: 0.75,
                            }}
                          >
                            Backup:{" "}
                            <strong style={{ opacity: 0.95 }}>
                              {decision.backup.resortName}
                            </strong>
                            {decision.backup.reason ? (
                              <span style={{ opacity: 0.85 }}>
                                {" "}
                                — {decision.backup.reason}
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        {/* CTA Row: icon buttons */}
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            marginTop: 4,
                            justifyContent: "flex-end",
                          }}
                        >
                          <IonButton
                            fill="outline"
                            size="small"
                            aria-label="Directions"
                            title="Directions"
                          >
                            <IonIcon
                              icon={navigateOutline}
                              aria-hidden="true"
                            />
                          </IonButton>

                          <IonButton
                            fill="outline"
                            size="small"
                            aria-label="Share plan"
                            title="Share plan"
                          >
                            <IonIcon icon={shareOutline} aria-hidden="true" />
                          </IonButton>

                          <IonButton
                            fill="outline"
                            size="small"
                            aria-label="Refresh data"
                            title="Refresh data"
                            onClick={refreshSnow}
                          >
                            <IonIcon icon={refreshOutline} aria-hidden="true" />
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

                      // 1) Date should be 2/17 (numeric month/day)
                      const md = (() => {
                        try {
                          return new Date(
                            d.dateISO + "T00:00:00",
                          ).toLocaleDateString(undefined, {
                            month: "numeric",
                            day: "numeric",
                          });
                        } catch {
                          return d.dateISO;
                        }
                      })();

                      // 2) Tag should be GO/WAIT/SKIP (semantic), not the color text
                      const labelText =
                        d.label === "green"
                          ? "GO"
                          : d.label === "yellow"
                            ? "WAIT"
                            : "SKIP";

                      // (Optional, non-breaking) show a subtle warning if score/pick is missing
                      const scoreMissing = !Number.isFinite(d.topPick?.score);
                      const resortMissing = !d.topPick?.resortName;
                      const lowConfidence = scoreMissing || resortMissing;

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
                            opacity: lowConfidence ? 0.9 : 1,
                          }}
                          title={[
                            d.dateISO,
                            d.topPick?.resortName ?? "(missing resort)",
                            Number.isFinite(d.topPick?.score)
                              ? `score ${d.topPick.score}`
                              : "(missing score)",
                          ].join(" • ")}
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
                                alignItems: "center",
                              }}
                            >
                              <div style={{ fontSize: 12, opacity: 0.9 }}>
                                {dayOfWeekShort(d.dateISO)}
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                {lowConfidence ? (
                                  <span
                                    style={{
                                      fontSize: 12,
                                      opacity: 0.8,
                                      padding: "2px 6px",
                                      borderRadius: 999,
                                      border: "1px solid #ffffff22",
                                      background: "#ffffff08",
                                    }}
                                    title={`Missing: ${
                                      [
                                        resortMissing ? "resort" : null,
                                        scoreMissing ? "score" : null,
                                      ]
                                        .filter(Boolean)
                                        .join(", ") || "inputs"
                                    }`}
                                    aria-label="Low confidence"
                                  >
                                    ⚠
                                  </span>
                                ) : (
                                  // reserve space so height doesn't shift
                                  <span style={{ width: 22 }} />
                                )}

                                <div style={{ fontSize: 12, opacity: 0.8 }}>
                                  {md}
                                </div>
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
                              {labelText}
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
                                {d.topPick?.resortName ?? "—"}
                              </div>

                              <div style={{ fontSize: 12, opacity: 0.85 }}>
                                Score:{" "}
                                <span style={{ fontWeight: 700 }}>
                                  {Number.isFinite(d.topPick?.score)
                                    ? d.topPick.score
                                    : "—"}
                                </span>
                              </div>
                            </div>

                            {d.runnersUp?.length > 0 && (
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
                  {/* GPT_REGION:WEEK_SUMMARY:START */}
                  {selectedDay && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 10,
                        borderTop: "1px solid #ffffff1a",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      {(() => {
                        const labelText =
                          selectedDay.label === "green"
                            ? "GO"
                            : selectedDay.label === "yellow"
                              ? "WAIT"
                              : "SKIP";

                        const md = (() => {
                          try {
                            return new Date(
                              selectedDay.dateISO + "T00:00:00",
                            ).toLocaleDateString(undefined, {
                              month: "numeric",
                              day: "numeric",
                            });
                          } catch {
                            return selectedDay.dateISO;
                          }
                        })();

                        const score = selectedDay.topPick?.score;
                        const scoreText = Number.isFinite(score)
                          ? String(score)
                          : "—";

                        return (
                          <>
                            {/* Header */}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "baseline",
                                gap: 12,
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ fontWeight: 900, fontSize: 16 }}>
                                {dayOfWeekShort(selectedDay.dateISO)} · {md}
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  gap: 10,
                                  alignItems: "center",
                                }}
                              >
                                <div
                                  style={{
                                    padding: "4px 10px",
                                    borderRadius: 999,
                                    border: "1px solid #ffffff22",
                                    background: "#ffffff08",
                                    fontWeight: 900,
                                    fontSize: 12,
                                    letterSpacing: 0.3,
                                  }}
                                  title={labelText}
                                >
                                  {labelText}
                                </div>

                                <div style={{ opacity: 0.85, fontSize: 12 }}>
                                  Score:{" "}
                                  <span style={{ fontWeight: 900 }}>
                                    {scoreText}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Top pick */}
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                              }}
                            >
                              <div style={{ fontSize: 12, opacity: 0.75 }}>
                                Top pick
                              </div>
                              <div
                                style={{
                                  fontWeight: 900,
                                  fontSize: 16,
                                  lineHeight: 1.15,
                                }}
                              >
                                {selectedDay.topPick?.resortName ?? "—"}
                              </div>
                            </div>

                            {/* Runners up */}
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                              }}
                            >
                              <div style={{ fontSize: 12, opacity: 0.75 }}>
                                Runners up
                              </div>

                              {selectedDay.runnersUp.length > 0 ? (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                  }}
                                >
                                  {selectedDay.runnersUp
                                    .slice(0, 3)
                                    .map((r) => (
                                      <div
                                        key={r.resortId}
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          gap: 10,
                                          opacity: 0.92,
                                        }}
                                      >
                                        <span style={{ fontWeight: 800 }}>
                                          {r.resortName}
                                        </span>
                                        <span
                                          style={{
                                            fontVariantNumeric: "tabular-nums",
                                            fontWeight: 900,
                                            opacity: 0.85,
                                            whiteSpace: "nowrap",
                                          }}
                                          title="Runner-up score"
                                        >
                                          {Number.isFinite(r.score)
                                            ? r.score
                                            : "—"}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              ) : (
                                <div style={{ opacity: 0.6 }}>—</div>
                              )}
                            </div>

                            {/* Why */}
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                              }}
                            >
                              <div style={{ fontSize: 12, opacity: 0.75 }}>
                                Why
                              </div>

                              {selectedDay.bullets.length > 0 ? (
                                <ul
                                  style={{
                                    margin: 0,
                                    paddingLeft: 18,
                                    opacity: 0.92,
                                  }}
                                >
                                  {selectedDay.bullets
                                    .slice(0, 4)
                                    .map((b, i) => (
                                      <li key={i} style={{ marginBottom: 4 }}>
                                        {b}
                                      </li>
                                    ))}
                                </ul>
                              ) : (
                                <div style={{ opacity: 0.6 }}>—</div>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  {/* GPT_REGION:WEEK_SUMMARY:END */}
                  {import.meta.env.DEV && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid #ffffff22",
                        background: "#ffffff08",
                        fontSize: 12,
                        opacity: 0.92,
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>
                        DEV: Data status
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "140px 1fr",
                          gap: 6,
                        }}
                      >
                        <div style={{ opacity: 0.75 }}>Selected day</div>
                        <div
                          style={{
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        >
                          {selectedDay?.dateISO ?? "—"}
                        </div>

                        <div style={{ opacity: 0.75 }}>Geo</div>
                        <div
                          style={{
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        >
                          {(() => {
                            const g: any = geo as any; // geo is in your component state already
                            if (!g) return "—";
                            if (g.status === "ready")
                              return `${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}`;
                            return g.status ?? "—";
                          })()}
                        </div>

                        <div style={{ opacity: 0.75 }}>Snow cache</div>
                        <div
                          style={{
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        >
                          {(() => {
                            try {
                              const raw =
                                localStorage.getItem("srs_snow_cache_v1");
                              if (!raw) return "empty";
                              return `present (${raw.length} chars)`;
                            } catch {
                              return "unavailable";
                            }
                          })()}
                        </div>

                        <div style={{ opacity: 0.75 }}>Top pick</div>
                        <div
                          style={{
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        >
                          {selectedDay?.topPick?.resortName ?? "—"}{" "}
                          {Number.isFinite(selectedDay?.topPick?.score)
                            ? `(${selectedDay!.topPick.score})`
                            : ""}
                        </div>

                        <div style={{ opacity: 0.75 }}>Label</div>
                        <div
                          style={{
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        >
                          {selectedDay?.label ?? "—"}
                        </div>
                      </div>
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
