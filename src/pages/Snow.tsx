import {
  IonBadge,
  IonButton,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonPage,
  IonRange,
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
import { resolveGeo, clearGeoCache } from "../services/geo/location";
import type { GeoReady as GeoReadyFromSvc } from "../services/geo/location";

const FALLBACK_DRIVE_MILES: Record<string, number> = {
  patspeak: 47,
  gunstock: 61,
  sunapee: 65,
  ragged: 70,
  waterville: 89,
};

type GeoUi =
  | { status: "idle" | "loading" }
  | GeoReadyFromSvc
  | { status: "error"; message: string; at: number };

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

function fmtInches(v: number | null) {
  return v === null ? "—" : `${v}"`;
}
function fmtMiles(v: number) {
  return `${Math.round(v)} mi`;
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
    if (metric === "Next 24h")
      return "NWS-derived gridpoint forecast (not resort-reported).";
    return "Derived from resort site data (parsed, not manually verified).";
  }

  if (metric === "Next 24h") return "NWS forecast.";
  return "Resort-reported snowfall.";
}

export default function Snow() {
  // geo
  const [geo, setGeo] = useState<GeoUi>({ status: "idle" });

  useEffect(() => {
    let alive = true;
    (async () => {
      setGeo({ status: "loading" });
      try {
        const g = await resolveGeo({ timeoutMs: 8000 });
        if (!alive) return;
        setGeo(g as any);
      } catch (e: any) {
        if (!alive) return;
        setGeo({
          status: "error",
          message: e?.message ?? "Failed to resolve location.",
          at: Date.now(),
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function retryLocation() {
    clearGeoCache();
    window.location.reload();
  }

  // snow data loaded via service abstraction
  const [snowById, setSnowById] = useState<Record<string, SnowMetrics>>({});
  const [snowLoading, setSnowLoading] = useState<boolean>(true);

  function refreshSnow() {
    try {
      localStorage.removeItem("srs_snow_cache_v1");
      // keep geo cache clearing explicit via Retry
    } catch {
      // ignore
    }
    window.location.reload();
  }

  const resortsWithMiles = useMemo(() => {
    if (geo.status !== "ready") {
      // Location off/loading/error → show all resorts without miles.
      return RESORTS.map((r) => ({ resort: r, miles: null as number | null }));
    }

    const here = { lat: geo.lat, lon: geo.lon };

    // Compute miles for all resorts (NO radius filtering here).
    // Radius filtering happens once downstream (inRadiusResortsWithMiles).
    return RESORTS.map((r) => ({
      resort: r,
      miles: haversineMiles(here, { lat: r.lat, lon: r.lon }),
    }));
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
        miles >= 0
      ) {
        m[id] = miles;
      }
    }

    return m;
  }, [resortsWithMiles]);

  // Default radius (future hook: allow override via localStorage)
  const DEFAULT_MAX_MILES = 110;
  const LS_MAX_MILES = "srs_max_miles_v1";

  function clampMiles(n: number) {
    const v = Math.round(n / 10) * 10;
    return Math.max(10, Math.min(300, v));
  }

  function readMaxMiles(): number {
    try {
      const raw = localStorage.getItem(LS_MAX_MILES);
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n) && n > 0) return clampMiles(n);
    } catch {}
    return DEFAULT_MAX_MILES;
  }

  const [maxMiles, setMaxMiles] = useState<number>(() => readMaxMiles());
  const [radiusOpen, setRadiusOpen] = useState(false);

  function persistMaxMiles(n: number) {
    const v = clampMiles(n);
    setMaxMiles(v);
    try {
      localStorage.setItem(LS_MAX_MILES, String(v));
    } catch {}
  }

  function getMaxMiles(): number {
    try {
      const raw = localStorage.getItem(LS_MAX_MILES);
      if (!raw) return DEFAULT_MAX_MILES;
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0 && n < 500) return n;
    } catch {
      // ignore
    }
    return DEFAULT_MAX_MILES;
  }

  /**
   * Single boundary:
   * resortsWithMiles -> filter <= maxMiles -> deterministic sort -> resortsForFetch
   * This same filtered+sorted list should also be used for UI rendering.
   */
  const inRadiusResortsWithMiles = useMemo(() => {
    return (
      resortsWithMiles
        // safety: tolerate undefined miles
        .filter((x) => (x.miles ?? Number.POSITIVE_INFINITY) <= maxMiles)
        // deterministic: miles asc, then id asc
        .sort(
          (a, b) =>
            (a.miles ?? 0) - (b.miles ?? 0) ||
            String(a.resort?.id ?? "").localeCompare(
              String(b.resort?.id ?? ""),
            ),
        )
    );
  }, [resortsWithMiles, maxMiles]);

  const resortsForFetch = useMemo(
    () => inRadiusResortsWithMiles.map((x) => x.resort),
    [inRadiusResortsWithMiles],
  );
  const resortsInRadius = resortsForFetch; // alias for clarity

  // Load snow data via service abstraction (bounded to filtered set)
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
  }, [resortsForFetch, snowService]);

  // Planner
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
      resorts: resortsInRadius, // ✅ filtered
      driveMilesByResortId: driveMilesById,
    });
  }, [outlook, driveMilesById, resortsInRadius]);

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

  const headerNote = useMemo(() => {
    // Age formatting with rounding
    function formatAgeRounded(ms: number): string {
      const totalMinutes = Math.max(0, Math.round(ms / 60000));

      if (totalMinutes < 60) return `${totalMinutes}m ago`;

      const totalHours = totalMinutes / 60;

      // Under 6h: round to nearest 15m
      if (totalHours < 6) {
        const rounded15 = Math.round(totalMinutes / 15) * 15;
        const h = Math.floor(rounded15 / 60);
        const m = rounded15 % 60;
        if (m === 0) return `${h}h ago`;
        return `${h}h ${m}m ago`;
      }

      // 6h–48h: round to nearest hour
      if (totalHours < 48) {
        const h = Math.round(totalHours);
        return `${h}h ago`;
      }

      // 2d+: round to nearest day, include hours only if material
      const days = Math.floor(totalHours / 24);
      const remHours = Math.round(totalHours - days * 24);
      if (remHours <= 1) return `${days}d ago`;
      return `${days}d ${remHours}h ago`;
    }

    // Subtle degrade based on staleness
    function ageTone(ageMs: number) {
      const mins = ageMs / 60000;
      if (mins <= 30) return { opacity: 0.9, color: undefined as any };
      if (mins <= 6 * 60) return { opacity: 0.82, color: undefined as any };
      if (mins <= 24 * 60) return { opacity: 0.72, color: undefined as any };
      return { opacity: 0.72, color: "warning" as const };
    }

    if (geo.status === "loading") {
      return <IonNote style={{ opacity: 0.8 }}>Getting location…</IonNote>;
    }

    if (geo.status === "ready") {
      const ageMs = Date.now() - geo.at;

      const sourceLabel =
        geo.source === "current"
          ? "current"
          : geo.source === "cached"
            ? "saved"
            : "default";

      const tone =
        geo.source === "current"
          ? { opacity: 0.9, color: undefined }
          : ageTone(ageMs);

      // We are *not* reverse-geocoding here (no new APIs).
      // If you later add a known anchor label, you can inject it here.
      const line =
        geo.source === "current"
          ? `${maxMiles} mi · current`
          : `${maxMiles} mi · ${sourceLabel} ${formatAgeRounded(ageMs)}`;

      return (
        <IonNote color={tone.color} style={{ opacity: tone.opacity }}>
          {line}
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
    }

    if (geo.status === "error") {
      return (
        <IonNote color="warning" style={{ opacity: 0.78 }}>
          {maxMiles} mi · location off
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
    }

    return null;
  }, [geo, maxMiles, retryLocation]);

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

                    const heroDateISO =
                      selectedDay?.dateISO ?? decision.window?.startISO ?? null;

                    const headline = heroDateISO
                      ? `Best for ${dayOfWeekShort(heroDateISO)} (${fmtMonthDay(heroDateISO)})`
                      : decision.window?.label
                        ? `${decision.window.label} (${fmtMonthDay(
                            decision.window.startISO,
                          )}–${fmtMonthDay(decision.window.endISO)})`
                        : "Best for —";

                    const primaryPick =
                      selectedDay?.topPick ??
                      weekVM.summary.decision.picks?.[0] ??
                      null;
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

                    const whyBullets =
                      (selectedDay?.topPick?.bullets?.length
                        ? selectedDay.topPick.bullets
                        : selectedDay?.bullets?.length
                          ? selectedDay.bullets
                          : (decision.why ?? [])) ?? [];

                    function renderWhyRow(b: string, i: number) {
                      const text = String(b ?? "");

                      if (text.toLowerCase().startsWith("snow signal:")) {
                        const match = text.match(/(\d+(\.\d+)?")/);
                        const snowValue = match ? match[1] : "";

                        const winStartISO = heroDateISO!;
                        const winEndISO = addDaysISO(heroDateISO!, 1);

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

                      const labelText =
                        d.label === "green"
                          ? "GO"
                          : d.label === "yellow"
                            ? "WAIT"
                            : "SKIP";

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
                            border: `2px solid ${isSelected ? "#3BA9FF" : "transparent"}`,
                            boxShadow: `0 0 0 1px ${isSelected ? "#3BA9FF" : "#ffffff22"}`,
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
                  {/* (your existing WEEK_SUMMARY block can remain as-is if you want;
                      this replacement focuses on restoring compilation + geo + snow grid) */}
                  {/* GPT_REGION:WEEK_SUMMARY:END */}
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

                <IonButton
                  size="small"
                  fill="outline"
                  onClick={() => setRadiusOpen(true)}
                  aria-label="Change drive radius"
                  title="Change drive radius"
                  style={{ height: 28 }}
                >
                  <IonBadge style={{ marginRight: 6 }}>{maxMiles} mi</IonBadge>
                  <span style={{ fontSize: 12, opacity: 0.85 }}>Radius</span>
                </IonButton>

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

        <IonModal isOpen={radiusOpen} onDidDismiss={() => setRadiusOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>Drive radius</IonTitle>
              <IonButton
                slot="end"
                fill="clear"
                onClick={() => setRadiusOpen(false)}
              >
                Done
              </IonButton>
            </IonToolbar>
          </IonHeader>

          <IonContent className="ion-padding">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{maxMiles} mi</div>

              <IonRange
                min={10}
                max={300}
                step={10}
                snaps={true}
                pin={true}
                value={maxMiles}
                onIonChange={(e) => {
                  const v = Number(e.detail.value);
                  if (Number.isFinite(v)) persistMaxMiles(v);
                }}
              />

              <div style={{ fontSize: 13, opacity: 0.75 }}>
                Adjust in 10-mile increments. This immediately refilters resorts
                and refetches snow only for in-radius resorts.
              </div>

              <IonButton
                fill="outline"
                onClick={() => persistMaxMiles(DEFAULT_MAX_MILES)}
              >
                Reset to {DEFAULT_MAX_MILES} mi
              </IonButton>
            </div>
          </IonContent>
        </IonModal>

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
            : inRadiusResortsWithMiles.map(({ resort, miles }) => {
                const snow = snowById[resort.id] ?? {
                  last48In: null,
                  next24In: null,
                  updatedAt: "—",
                };

                const updatedRaw =
                  (snow as any).last48Meta?.updatedAt ??
                  (snow as any).next24Meta?.updatedAt ??
                  null;

                const updatedPretty = (() => {
                  if (!updatedRaw) return "—";
                  try {
                    return shortTimeStamp(updatedRaw);
                  } catch {
                    return String(updatedRaw);
                  }
                })();

                const last48Warn = (() => {
                  const ind = getIndicator(
                    (snow as any).last48Meta,
                    (snow as any).last48In,
                  );
                  return ind?.kind === "warn";
                })();

                const next24Warn = (() => {
                  const ind = getIndicator(
                    (snow as any).next24Meta,
                    (snow as any).next24In,
                  );
                  return ind?.kind === "warn";
                })();

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
                          <span className="numVal">
                            {fmtInches((snow as any).last48In)}
                          </span>
                          {last48Warn ? (
                            <span
                              className="warnMark"
                              title={metricTooltip(
                                "Last 48h",
                                (snow as any).last48Meta,
                              )}
                              aria-label="Missing last 48 hours input"
                            >
                              {" "}
                              (!)
                            </span>
                          ) : null}
                        </span>

                        <span className="colNum">
                          <span className="numVal">
                            {fmtInches((snow as any).next24In)}
                          </span>
                          {next24Warn ? (
                            <span
                              className="warnMark"
                              title={metricTooltip(
                                "Next 24h",
                                (snow as any).next24Meta,
                              )}
                              aria-label="Missing next 24 hours input"
                            >
                              {" "}
                              (!)
                            </span>
                          ) : null}
                        </span>

                        <span className="colUpdated">{updatedPretty}</span>
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
