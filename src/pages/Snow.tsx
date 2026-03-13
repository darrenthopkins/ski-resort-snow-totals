//src/pages/Snow.tsx

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
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
} from "@ionic/react";
import { IonIcon } from "@ionic/react";
import type { RefresherEventDetail } from "@ionic/core";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import "./Snow.css";

import { RESORTS } from "../data/resorts";
import { haversineMiles } from "../lib/geo";
import { todayISO } from "../lib/date";
import { buildWeekPlan } from "../lib/weekPlanner";
import { buildWeekPlanViewModel } from "../lib/weekPlannerViewModel";
import { snowService } from "../services/snow";
import type { SnowMetrics } from "../services/snow/types";

import { resolveGeo, clearGeoCache } from "../services/geo/location";
import type { GeoReady as GeoReadyFromSvc } from "../services/geo/location";
import {
  carOutline,
  leafOutline,
  navigateOutline,
  snowOutline,
  thermometerOutline,
} from "ionicons/icons";
/** ---------------------------
 *  Constants / helpers (module scope)
 *  --------------------------- */
const DEFAULT_MAX_MILES = 110;
const LS_MAX_MILES = "srs_max_miles_v1";
const LS_SNOW_CACHE = "srs_snow_cache_v1";

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
  /** ---------------------------
   *  State
   *  --------------------------- */
  const [geo, setGeo] = useState<GeoUi>({ status: "idle" });

  const [snowById, setSnowById] = useState<Record<string, SnowMetrics>>({});
  const [snowLoading, setSnowLoading] = useState<boolean>(true);

  const [maxMiles, setMaxMiles] = useState<number>(() => readMaxMiles());
  const [radiusOpen, setRadiusOpen] = useState(false);

  // Bump this to force a refetch without reload.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [geoNonce, setGeoNonce] = useState(0);

  const ageCompact = useMemo(() => {
    if (geo.status !== "ready") return null;
    const ageMs = Date.now() - geo.at;

    const totalMinutes = Math.max(0, Math.round(ageMs / 60000));
    if (totalMinutes < 60) return `${totalMinutes}m`;

    const totalHours = totalMinutes / 60;
    if (totalHours < 6) {
      const rounded15 = Math.round(totalMinutes / 15) * 15;
      const h = Math.floor(rounded15 / 60);
      const m = rounded15 % 60;
      return m === 0 ? `${h}h` : `${h}h ${m}m`;
    }

    if (totalHours < 48) return `${Math.round(totalHours)}h`;

    const days = Math.floor(totalHours / 24);
    const remHours = Math.round(totalHours - days * 24);
    return remHours <= 1 ? `${days}d` : `${days}d ${remHours}h`;
  }, [geo]);

  const radiusStatus = useMemo(() => {
    if (geo.status === "ready") {
      if (geo.source === "current") return "from you · now";
      if (geo.source === "cached")
        return ageCompact
          ? `from you · saved ${ageCompact} ago`
          : "from you · previous";
      return "from you · saved";
    }
    if (geo.status === "loading") return "getting location…";
    if (geo.status === "error") return "location off";
    return "location…";
  }, [geo, ageCompact]);

  /** ---------------------------
   *  Geo resolve (soft)
   *  --------------------------- */
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
  }, [geoNonce]);

  const retryLocation = useCallback(() => {
    clearGeoCache();
    setGeoNonce((x) => x + 1);
  }, []);

  /** ---------------------------
   *  Radius persistence
   *  --------------------------- */
  function persistMaxMiles(n: number) {
    const v = clampMiles(n);
    setMaxMiles(v);
    try {
      localStorage.setItem(LS_MAX_MILES, String(v));
    } catch {}
    // radius change already triggers refetch via resortsForFetch dependency,
    // but bumping refreshNonce makes intent explicit and fixes “same deps” edge cases.
    setRefreshNonce((x) => x + 1);
  }

  /** ---------------------------
   *  Resorts + miles (single boundary)
   *  --------------------------- */
  const resortsWithMiles = useMemo(() => {
    if (geo.status !== "ready") {
      return RESORTS.map((r) => ({ resort: r, miles: null as number | null }));
    }

    const ANCHOR = { lat: 42.657, lon: -71.137 }; // North Andover-ish

    const here =
      geo.status === "ready" ? { lat: geo.lat, lon: geo.lon } : ANCHOR;

    return RESORTS.map((r) => ({
      resort: r,
      miles: haversineMiles(here, { lat: r.lat, lon: r.lon }),
    }))
      .filter((x) => (x.miles ?? Number.POSITIVE_INFINITY) <= maxMiles)
      .sort(
        (a, b) =>
          (a.miles ?? 0) - (b.miles ?? 0) ||
          a.resort.id.localeCompare(b.resort.id),
      );
  }, [geo, maxMiles]);

  const resortsForFetch = useMemo(
    () => resortsWithMiles.map((x) => x.resort),
    [resortsWithMiles],
  );
  const resortsInRadius = resortsForFetch;

  const driveMilesById = useMemo(() => {
    const m: Record<string, number> = { ...FALLBACK_DRIVE_MILES };
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

  /** ---------------------------
   *  Snow fetch (single path)
   *  --------------------------- */
  const refreshSnowSoft = useCallback(async () => {
    // clear cache then refetch (no reload)
    try {
      localStorage.removeItem(LS_SNOW_CACHE);
    } catch {}
    setRefreshNonce((x) => x + 1);
  }, []);

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
  }, [resortsForFetch, refreshNonce]);

  /** ---------------------------
   *  Planner + VM
   *  --------------------------- */
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
      resorts: resortsInRadius,
      driveMilesByResortId: driveMilesById,
      snowByResortId: snowById,
    });
  }, [outlook, driveMilesById, resortsInRadius, snowById]);

  /** ---------------------------
   *  Timeline selection
   *  --------------------------- */
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

  const dayButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
    const key = selectedDay?.dateISO;
    if (!key) return;

    const el = dayButtonRefs.current[key];
    if (!el) return;

    el.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedDay?.dateISO]);

  useEffect(() => {
    if (selectedDateISO) return;
    if (!weekVM?.days?.length) return;
    const best = weekVM.days.reduce((a, b) =>
      b.topPick.score > a.topPick.score ? b : a,
    );
    setSelectedDateISO(best.dateISO);
  }, [weekVM, selectedDateISO]);

  /** ---------------------------
   *  Formatting helpers
   *  --------------------------- */
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

  function fmtRecentSnowHero(v: number | null | undefined): string {
    if (v == null) return "No recent snow";
    const n = Number(v);
    if (!Number.isFinite(n)) return "No recent snow";
    if (n <= 0) return "No recent snow";
    const rounded = Math.round(n * 10) / 10;
    if (rounded <= 0) return "No recent snow";
    return `${rounded.toFixed(1)}" recent`;
  }

  function fmtNext24SnowHero(v: number | null | undefined): string {
    if (v == null) return "— next 24";
    const n = Number(v);
    if (!Number.isFinite(n)) return "— next 24";
    if (n <= 0) return "No snow next 24";
    return `${n.toFixed(1)}" next 24`;
  }
  function fmtSelectedPrevious48Hero(
    label?: string | null,
    inches?: number | null,
  ): string {
    if (label && typeof inches === "number" && Number.isFinite(inches)) {
      return `${label}: ${inches.toFixed(inches >= 10 ? 0 : 1)}"`;
    }
    if (label) return `${label}: —`;
    return "Recent: —";
  }

  function fmtSelectedNext24Hero(
    label?: string | null,
    inches?: number | null,
  ): string {
    if (label && typeof inches === "number" && Number.isFinite(inches)) {
      return `${label}: ${inches.toFixed(inches >= 10 ? 0 : 1)}"`;
    }
    if (label) return `${label}: —`;
    return "Next 24: —";
  }

  function medalTone(label: "Gold" | "Silver" | "Bronze") {
    if (label === "Gold") {
      return {
        medal: "🥇",
        border: "#C9A227",
        bg: "linear-gradient(180deg, #4b3a12 0%, #2b220c 100%)",
        chipBg: "#6b5317",
      };
    }
    if (label === "Silver") {
      return {
        medal: "🥈",
        border: "#9AA3AD",
        bg: "linear-gradient(180deg, #38414a 0%, #22272d 100%)",
        chipBg: "#4d5863",
      };
    }
    return {
      medal: "🥉",
      border: "#A56A43",
      bg: "linear-gradient(180deg, #4a2f22 0%, #2b1d15 100%)",
      chipBg: "#6b4430",
    };
  }

  function extractMedalWxDetails(bullets?: string[] | null) {
    const wxText =
      bullets?.find((b) => {
        const t = String(b ?? "");
        return t.includes("°F") || t.toLowerCase().includes("wind");
      }) ?? "";

    const tempRange =
      wxText.match(/(\-?\d+)\s*[–-]\s*(\-?\d+)\s*°F/i) ??
      wxText.match(/(\-?\d+)\s*to\s*(\-?\d+)\s*°F/i);

    const tempSingle = wxText.match(/(\-?\d+)\s*°F/i);

    const wind =
      wxText.match(/wind[^0-9]*(\d+)\s*mph/i)?.[1] ??
      wxText.match(/(\d+)\s*mph/i)?.[1] ??
      null;

    const tempText = tempRange
      ? `${tempRange[1]}–${tempRange[2]}°F`
      : tempSingle
      ? `${tempSingle[1]}°F`
      : "—";

    const windText = wind ? `≤ ${wind} mph` : "—";

    return { tempText, windText };
  }

  function extractMedalDriveText(bullets?: string[] | null) {
    const driveText =
      bullets?.find((b) =>
        String(b ?? "")
          .toLowerCase()
          .includes("drive"),
      ) ?? "";

    const miles = driveText.match(/(\d+)\s*mi/i)?.[1] ?? null;
    return miles ? `~${miles} mi` : "—";
  }

  function selectedDaySnowValue(params: {
    resortId?: string | null;
    dateISO?: string | null;
    kind: "previous48" | "next24";
  }): { label: string; inches: number | null } {
    const { resortId, dateISO, kind } = params;

    if (!resortId || !dateISO) {
      return {
        label: kind === "previous48" ? "Recent" : "Next 24",
        inches: null,
      };
    }

    const snow = snowById[resortId] as any;
    if (!snow) {
      return {
        label: kind === "previous48" ? "Recent" : dayOfWeekShort(dateISO),
        inches: null,
      };
    }

    if (kind === "previous48") {
      const prev2ISO = (() => {
        const [y, m, d] = dateISO.split("-").map(Number);
        const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
        dt.setDate(dt.getDate() - 2);
        const yy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, "0");
        const dd = String(dt.getDate()).padStart(2, "0");
        return `${yy}-${mm}-${dd}`;
      })();

      const prev1ISO = (() => {
        const [y, m, d] = dateISO.split("-").map(Number);
        const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
        dt.setDate(dt.getDate() - 1);
        const yy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, "0");
        const dd = String(dt.getDate()).padStart(2, "0");
        return `${yy}-${mm}-${dd}`;
      })();

      const recentDaily = snow?.recentSnowDaily;
      let inches: number | null = null;

      if (Array.isArray(recentDaily)) {
        const byIso = new Map<string, number>();
        const byLabel = new Map<string, number>();

        for (const row of recentDaily) {
          const iso = String(row?.isoDate ?? "").slice(0, 10);
          const label = String(row?.label ?? "");
          const raw = row?.inches;
          const n =
            typeof raw === "number" && Number.isFinite(raw) ? raw : null;

          if (iso && n != null) byIso.set(iso, n);
          if (label && n != null) byLabel.set(label, n);
        }

        const isoHit = byIso.has(prev2ISO) || byIso.has(prev1ISO);
        if (isoHit) {
          inches = (byIso.get(prev2ISO) ?? 0) + (byIso.get(prev1ISO) ?? 0);
        } else {
          const prev2Label = dayOfWeekShort(prev2ISO);
          const prev1Label = dayOfWeekShort(prev1ISO);
          const labelHit = byLabel.has(prev2Label) || byLabel.has(prev1Label);
          if (labelHit) {
            inches =
              (byLabel.get(prev2Label) ?? 0) + (byLabel.get(prev1Label) ?? 0);
          }
        }
      } else if (recentDaily && typeof recentDaily === "object") {
        const prev2Label = dayOfWeekShort(prev2ISO);
        const prev1Label = dayOfWeekShort(prev1ISO);

        const readObj = (key: string) => {
          const v = (recentDaily as Record<string, unknown>)[key];
          return typeof v === "number" && Number.isFinite(v) ? v : null;
        };

        const isoA = readObj(prev2ISO);
        const isoB = readObj(prev1ISO);
        if (isoA != null || isoB != null) {
          inches = (isoA ?? 0) + (isoB ?? 0);
        } else {
          const labA = readObj(prev2Label);
          const labB = readObj(prev1Label);
          if (labA != null || labB != null) {
            inches = (labA ?? 0) + (labB ?? 0);
          }
        }
      }

      return {
        label: `${dayOfWeekShort(prev2ISO)}-${dayOfWeekShort(prev1ISO)}`,
        inches,
      };
    }

    const weekDaily = snow?.weekSnowDaily;
    let inches: number | null = null;

    if (Array.isArray(weekDaily)) {
      const row = weekDaily.find((x: any) => {
        const iso = String(x?.isoDate ?? x?.dateISO ?? "").slice(0, 10);
        return iso === dateISO;
      });

      const raw = row?.inches ?? row?.snowIn ?? row?.snow ?? row?.value ?? null;

      inches = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    } else if (weekDaily && typeof weekDaily === "object") {
      const raw = (weekDaily as Record<string, unknown>)[dateISO];
      inches = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    }

    return {
      label: dayOfWeekShort(dateISO),
      inches,
    };
  }

  function buildMedalSnowLine(
    pick?: {
      resortId?: string;
      previous48Label?: string;
      previous48In?: number | null;
      next24Label?: string;
      next24In?: number | null;
    } | null,
  ) {
    if (!pick?.resortId || !selectedDay?.dateISO) return "Recent — · New —";

    const previous =
      typeof pick.previous48In === "number"
        ? { label: pick.previous48Label ?? "Recent", inches: pick.previous48In }
        : selectedDaySnowValue({
            resortId: pick.resortId,
            dateISO: selectedDay.dateISO,
            kind: "previous48",
          });

    const next =
      typeof pick.next24In === "number"
        ? {
            label: pick.next24Label ?? dayOfWeekShort(selectedDay.dateISO),
            inches: pick.next24In,
          }
        : selectedDaySnowValue({
            resortId: pick.resortId,
            dateISO: selectedDay.dateISO,
            kind: "next24",
          });

    const previousText =
      previous.inches == null
        ? `${previous.label}: —`
        : `${previous.label}: ${previous.inches.toFixed(
            previous.inches >= 10 ? 0 : 1,
          )}"`;

    const nextText =
      next.inches == null
        ? `${next.label}: —`
        : `${next.label}: ${next.inches.toFixed(next.inches >= 10 ? 0 : 1)}"`;

    return `${previousText} · ${nextText}`;
  }

  /** ---------------------------
   *  Header note (compass freshness only)
   *  --------------------------- */
  const headerNote = useMemo(() => {
    function formatAgeRounded(ms: number): string {
      const totalMinutes = Math.max(0, Math.round(ms / 60000));
      // Treat "basically now" as now (avoid "0m ago")
      if (totalMinutes <= 0) return "now";
      if (totalMinutes < 60) return `${totalMinutes}m ago`;

      const totalHours = totalMinutes / 60;
      if (totalHours < 6) {
        const rounded15 = Math.round(totalMinutes / 15) * 15;
        const h = Math.floor(rounded15 / 60);
        const m = rounded15 % 60;
        if (m === 0) return `${h}h ago`;
        return `${h}h ${m}m ago`;
      }
      if (totalHours < 48) {
        const h = Math.round(totalHours);
        return `${h}h ago`;
      }
      const days = Math.floor(totalHours / 24);
      const remHours = Math.round(totalHours - days * 24);
      if (remHours <= 1) return `${days}d ago`;
      return `${days}d ${remHours}h ago`;
    }

    function ageTone(ageMs: number) {
      const mins = ageMs / 60000;
      if (mins <= 30) return { opacity: 0.9, color: undefined as any };
      if (mins <= 6 * 60) return { opacity: 0.82, color: undefined as any };
      if (mins <= 24 * 60) return { opacity: 0.72, color: undefined as any };
      return { opacity: 0.72, color: "warning" as const };
    }

    if (geo.status === "loading") {
      return (
        <IonNote
          style={{
            opacity: 0.8,
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <IonIcon icon={navigateOutline} aria-hidden="true" />
          Locating…
        </IonNote>
      );
    }

    if (geo.status === "ready") {
      const ageMs = Date.now() - geo.at;
      const ageText = formatAgeRounded(ageMs);
      const tone =
        geo.source === "current" && ageText === "now"
          ? { opacity: 0.9, color: undefined as any }
          : ageTone(ageMs);

      return (
        <IonNote
          color={tone.color}
          style={{
            opacity: tone.opacity,
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <IonIcon icon={navigateOutline} aria-hidden="true" />
          {ageText}
        </IonNote>
      );
    }

    if (geo.status === "error") {
      return (
        <IonNote
          color="warning"
          style={{
            opacity: 0.78,
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <IonIcon icon={navigateOutline} aria-hidden="true" />
          off
        </IonNote>
      );
    }

    return null;
  }, [geo]);
  /** ---------------------------
   *  Render
   *  --------------------------- */
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Snow Totals</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <IonRefresher
          slot="fixed"
          onIonRefresh={async (ev: CustomEvent<RefresherEventDetail>) => {
            try {
              await refreshSnowSoft();
            } finally {
              ev.detail.complete();
            }
          }}
        >
          <IonRefresherContent />
        </IonRefresher>
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

                    const heroDayShort = heroDateISO
                      ? dayOfWeekShort(heroDateISO)
                      : "—";

                    const heroCaption = heroDateISO
                      ? `Best on ${fmtMonthDay(heroDateISO)}`
                      : decision.window?.label
                      ? `${decision.window.label} ${fmtMonthDay(
                          decision.window.startISO,
                        )}–${fmtMonthDay(decision.window.endISO)}`
                      : "Best on —";

                    const primaryPick =
                      selectedDay?.topPick ??
                      weekVM.summary.decision.picks?.[0] ??
                      null;

                    const primaryResortId = primaryPick?.resortId ?? null;

                    console.log("[hero primary snow]", {
                      primaryResortId,
                      resortName: primaryPick?.resortName,
                      selectedDateISO: selectedDay?.dateISO,
                      topPickNext24Label: selectedDay?.topPick?.next24Label,
                      topPickNext24In: selectedDay?.topPick?.next24In,
                      weekSnowDaily: primaryResortId
                        ? (snowById[primaryResortId] as any)?.weekSnowDaily
                        : null,
                      recentSnowDaily: primaryResortId
                        ? (snowById[primaryResortId] as any)?.recentSnowDaily
                        : null,
                    });

                    const next24Updated =
                      (primaryResortId
                        ? (snowById[primaryResortId] as any)?.next24Meta
                            ?.updatedAt
                        : null) ?? null;

                    const last48Updated =
                      (primaryResortId
                        ? (snowById[primaryResortId] as any)?.last48Meta
                            ?.updatedAt
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
                    const overall = primaryPick?.label ?? "red";
                    const overallColors = labelColors(overall);
                    const selectedPrevious48Label =
                      selectedDay?.topPick?.previous48Label ?? null;

                    const selectedPrevious48In =
                      typeof selectedDay?.topPick?.previous48In === "number"
                        ? selectedDay.topPick.previous48In
                        : null;

                    const selectedNext24Label =
                      selectedDay?.topPick?.next24Label ?? null;

                    const selectedNext24In =
                      typeof selectedDay?.topPick?.next24In === "number"
                        ? selectedDay.topPick.next24In
                        : primaryResortId && selectedDay?.dateISO
                        ? selectedDaySnowValue({
                            resortId: primaryResortId,
                            dateISO: selectedDay.dateISO,
                            kind: "next24",
                          }).inches
                        : null;
                    const whyBullets =
                      (selectedDay?.topPick?.bullets?.length
                        ? selectedDay.topPick.bullets
                        : selectedDay?.bullets?.length
                        ? selectedDay.bullets
                        : decision.why ?? []) ?? [];

                    const driveText =
                      whyBullets.find((b) =>
                        String(b ?? "")
                          .toLowerCase()
                          .startsWith("drive"),
                      ) ?? "";

                    const wxText =
                      whyBullets.find((b) => {
                        const t = String(b ?? "");
                        return (
                          t.includes("°F") || t.toLowerCase().includes("wind")
                        );
                      }) ?? "";

                    function parseDriveMilesOnly(s: string) {
                      const t = String(s ?? "");
                      const miles = t.match(/(\d+)\s*mi/i)?.[1] ?? null;
                      return miles ? `~${miles} mi` : null;
                    }

                    function parseWxCompact(s: string) {
                      const t = String(s ?? "");
                      const tempRange =
                        t.match(/(\-?\d+)\s*[–-]\s*(\-?\d+)\s*°F/i) ??
                        t.match(/(\-?\d+)\s*to\s*(\-?\d+)\s*°F/i);

                      const tempSingle = t.match(/(\-?\d+)\s*°F/i);

                      const temp = tempRange
                        ? `${tempRange[1]}–${tempRange[2]}°`
                        : tempSingle
                        ? `${tempSingle[1]}°`
                        : "—";

                      const wind =
                        t.match(/wind[^0-9]*(\d+)\s*mph/i)?.[1] ??
                        t.match(/(\d+)\s*mph/i)?.[1] ??
                        null;

                      return { temp, wind: wind ? `${wind}mph` : "—" };
                    }

                    const { temp: tempF, wind: windMph } =
                      parseWxCompact(wxText);
                    const driveMiles = parseDriveMilesOnly(driveText);

                    const updatedCompact =
                      provenanceLine && provenanceLine.length
                        ? provenanceLine
                        : null;

                    const geoCompact =
                      geo.status === "ready"
                        ? geo.source === "cached"
                          ? "📍 Saved location"
                          : "📍 Current location"
                        : geo.status === "loading"
                        ? "📍 Locating…"
                        : "📍 Location off";

                    return (
                      <div
                        style={{
                          borderRadius: 18,
                          padding: 16,
                          background: "#ffffff08",
                          border: "1px solid #ffffff1f",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          textAlign: "center",
                        }}
                      >
                        {/* Header: caption + big day-of-week + label badge (true centered) */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto 1fr",
                            alignItems: "start",
                            columnGap: 12,
                          }}
                        >
                          {/* left spacer column */}
                          <div />

                          {/* center stack */}
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 2,
                              minWidth: 0,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 800,
                                opacity: 0.6,
                                lineHeight: 1.1,
                              }}
                            >
                              {heroCaption}
                            </div>
                            <div
                              style={{
                                fontSize: 34,
                                fontWeight: 950,
                                lineHeight: 1.05,
                              }}
                            >
                              {heroDayShort}
                            </div>
                          </div>

                          {/* right badge column */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                            }}
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
                                whiteSpace: "nowrap",
                              }}
                            >
                              {labelPhrase(overall)}
                            </div>
                          </div>
                        </div>

                        {/* Resort: secondary */}
                        <div
                          style={{
                            fontSize: 22,
                            fontWeight: 900,
                            lineHeight: 1.1,
                            marginTop: -2,
                          }}
                        >
                          {primaryPick?.resortName ?? "—"}
                        </div>

                        {/* Score: “temperature-sized” */}
                        <div style={{ marginTop: -2 }}>
                          <div
                            style={{
                              fontSize: 54,
                              fontWeight: 950,
                              lineHeight: 1,
                            }}
                          >
                            {Number.isFinite(primaryPick?.score)
                              ? Math.round(primaryPick!.score)
                              : "—"}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 900,
                              opacity: 0.55,
                              marginTop: 4,
                            }}
                          >
                            Snow Score
                          </div>
                        </div>

                        {/* Drive miles only (omit entirely if unavailable) */}
                        {driveMiles ? (
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              opacity: 0.55,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              justifyContent: "center",
                            }}
                          >
                            <IonIcon icon={carOutline} aria-hidden="true" />
                            <span>{driveMiles}</span>
                          </div>
                        ) : null}
                        {/* Details list (Recent / Next 24 / Temp / Wind) */}
                        <div
                          style={{
                            display: "inline-flex",
                            flexDirection: "column",
                            gap: 8,
                            alignItems: "center",
                            marginTop: 6,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              fontSize: 16,
                              fontWeight: 900,
                            }}
                          >
                            <span>
                              {selectedPrevious48Label
                                ? fmtSelectedPrevious48Hero(
                                    selectedPrevious48Label,
                                    selectedPrevious48In,
                                  )
                                : primaryResortId
                                ? fmtRecentSnowHero(
                                    (snowById[primaryResortId] as any)
                                      ?.last48In,
                                  )
                                : "No recent snow"}
                            </span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              fontSize: 16,
                              fontWeight: 900,
                            }}
                          >
                            <IonIcon icon={snowOutline} aria-hidden="true" />
                            <span>
                              {selectedNext24Label
                                ? fmtSelectedNext24Hero(
                                    selectedNext24Label,
                                    selectedNext24In,
                                  )
                                : primaryResortId
                                ? fmtNext24SnowHero(
                                    snowById[primaryResortId]?.next24In,
                                  )
                                : "— next 24"}
                            </span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              fontSize: 16,
                              fontWeight: 900,
                            }}
                          >
                            <IonIcon
                              icon={thermometerOutline}
                              aria-hidden="true"
                            />
                            <span>{tempF}</span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              fontSize: 16,
                              fontWeight: 900,
                            }}
                          >
                            <IonIcon icon={leafOutline} aria-hidden="true" />
                            <span>{windMph}</span>
                          </div>
                        </div>
                        {/* Provenance (quiet) */}
                        {updatedCompact ? (
                          <div
                            style={{ fontSize: 11, opacity: 0.4, marginTop: 2 }}
                          >
                            {updatedCompact}
                          </div>
                        ) : null}

                        {/* Backup (quiet) */}
                        {decision.backup ? (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 12,
                              opacity: 0.65,
                            }}
                          >
                            Backup:{" "}
                            <strong style={{ opacity: 0.95 }}>
                              {decision.backup.resortName}
                            </strong>
                            {decision.backup.reason ? (
                              <span style={{ opacity: 0.8 }}>
                                {" "}
                                — {decision.backup.reason}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}

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
                          ref={(el) => {
                            dayButtonRefs.current[d.dateISO] = el;
                          }}
                          onClick={() => setSelectedDateISO(d.dateISO)}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            flex: "0 0 auto",
                            borderRadius: 14,
                            border: `2px solid ${
                              isSelected ? "#3BA9FF" : "transparent"
                            }`,
                            boxShadow: `0 0 0 1px ${
                              isSelected ? "#3BA9FF" : "#ffffff22"
                            }`,
                            background: isSelected
                              ? "#ffffff10"
                              : "transparent",
                            padding: 10,
                            minWidth: 140,
                            opacity: lowConfidence ? 0.9 : 1,
                          }}
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

                            <div
                              style={{
                                marginTop: 2,
                                fontSize: 12,
                                opacity: 0.82,
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                }}
                              >
                                <span style={{ opacity: 0.7 }}>Gold</span>
                                <span style={{ fontWeight: 800 }}>
                                  {d.topPick?.resortName ?? "—"}
                                </span>
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                }}
                              >
                                <span style={{ opacity: 0.7 }}>Silver</span>
                                <span style={{ fontWeight: 700 }}>
                                  {d.runnersUp?.[0]?.resortName ?? "—"}
                                </span>
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                }}
                              >
                                <span style={{ opacity: 0.7 }}>Bronze</span>
                                <span style={{ fontWeight: 700 }}>
                                  {d.runnersUp?.[1]?.resortName ?? "—"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </IonLabel>
            </IonItem>
          </IonList>
        )}
        {/* Picks (selected day): medals + why */}
        {weekVM && selectedDay && (
          <IonList inset={true}>
            <IonItem lines="none">
              <IonLabel>
                <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.6 }}>
                  Picks for {dayOfWeekShort(selectedDay.dateISO)}{" "}
                  {fmtMonthDay(selectedDay.dateISO)}
                </div>
              </IonLabel>
            </IonItem>

            <IonItem lines="none">
              <IonLabel>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                  }}
                >
                  {[
                    { label: "Gold" as const, resort: selectedDay.topPick },
                    {
                      label: "Silver" as const,
                      resort: selectedDay.runnersUp?.[0],
                    },
                    {
                      label: "Bronze" as const,
                      resort: selectedDay.runnersUp?.[1],
                    },
                  ].map(({ label, resort }) => {
                    const tone = medalTone(label);
                    const wx = extractMedalWxDetails(resort?.bullets);
                    const drive = extractMedalDriveText(resort?.bullets);
                    const snowLine = buildMedalSnowLine(resort);

                    return (
                      <div
                        key={label}
                        style={{
                          borderRadius: 16,
                          padding: 12,
                          border: `1px solid ${tone.border}`,
                          background: tone.bg,
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              fontWeight: 900,
                              fontSize: 13,
                              letterSpacing: 0.2,
                            }}
                          >
                            <span style={{ fontSize: 18 }}>{tone.medal}</span>
                            <span>{label}</span>
                          </div>

                          <div
                            style={{
                              display: "inline-flex",
                              padding: "4px 8px",
                              borderRadius: 999,
                              background: tone.chipBg,
                              border: "1px solid #ffffff22",
                              fontSize: 12,
                              fontWeight: 900,
                              lineHeight: 1,
                            }}
                          >
                            {Number.isFinite(resort?.score)
                              ? Math.round(resort!.score)
                              : "—"}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 950,
                            lineHeight: 1.15,
                          }}
                        >
                          {resort?.resortName ?? "—"}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 900,
                            opacity: 0.65,
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                          }}
                        >
                          Why
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            fontSize: 13,
                            opacity: 0.92,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <IonIcon icon={snowOutline} aria-hidden="true" />
                            <span>{snowLine}</span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <IonIcon
                              icon={thermometerOutline}
                              aria-hidden="true"
                            />
                            <span>{wx.tempText}</span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <IonIcon icon={leafOutline} aria-hidden="true" />
                            <span>{wx.windText}</span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <IonIcon icon={carOutline} aria-hidden="true" />
                            <span>{drive}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </IonLabel>
            </IonItem>
          </IonList>
        )}{" "}
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
                {/* Radius selector (button opens modal) */}
                <IonButton
                  size="small"
                  fill="outline"
                  onClick={() => setRadiusOpen(true)}
                  aria-label="Change drive radius"
                  title="Change drive radius"
                  style={{ height: 28 }}
                >
                  <IonBadge>{maxMiles} mi</IonBadge>
                </IonButton>

                {/* Location freshness (🧭 age/now only) */}
                {headerNote}

                {/* Update location */}
                <IonButton
                  size="small"
                  fill="outline"
                  onClick={retryLocation}
                  aria-label="Update location"
                  title="Update location"
                  style={{ height: 28 }}
                >
                  Update location
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
            : resortsWithMiles.map(({ resort, miles }) => {
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
                    return shortTimeStamp(updatedRaw) ?? "—";
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
