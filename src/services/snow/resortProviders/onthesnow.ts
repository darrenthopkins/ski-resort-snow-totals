import { RESORT_PROVIDER_IDS } from '../../../data/resorts';
import type { Resort } from '../../../data/resorts';
import { fetchTextViaProxy } from '../../http/fetchViaProxy';

function between(h: string, a: string, b: string): string | null {
  const i = h.indexOf(a);
  if (i < 0) return null;
  const j = h.indexOf(b, i + a.length);
  if (j < 0) return null;
  return h.slice(i, j);
}

function parseLast48FromRecentSnowfall(html: string): number | null {
  // Anchor around Recent Snowfall to avoid picking up unrelated inches like Base/Summit.
  const section =
    between(html, '### Recent Snowfall', '### Forecasted Snow') ??
    between(html, 'Recent Snowfall', 'Forecasted Snow');

  if (!section) return null;

  // Further tighten to the "Recent Snowfall" block before Base/Summit cards if present.
  const recentBlock =
    between(section, 'Recent Snowfall', 'Base') ??
    between(section, 'Recent Snowfall', 'Summit') ??
    section;

  // Extract values that are associated with day labels (Mon..Sun or 24h).
  // This avoids matching Base 24", Summit 36", etc.
  const matches = [...recentBlock.matchAll(/(?:\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|24h)\b)[\s\S]{0,120}?(\d+(?:\.\d+)?)"/g)];

  if (matches.length === 0) return null;

  // Prefer summing the last two *day* values (exclude 24h if present).
  const dayVals = matches
    .filter(m => m[1] !== '24h')
    .map(m => Number(m[2]))
    .filter(n => Number.isFinite(n));

  if (dayVals.length >= 2) {
    return dayVals[dayVals.length - 1] + dayVals[dayVals.length - 2];
  }

  // If we only have one day value, fall back to 24h if present.
  const anyVals = matches
    .map(m => Number(m[2]))
    .filter(n => Number.isFinite(n));

  if (anyVals.length >= 2) return anyVals[anyVals.length - 1] + anyVals[anyVals.length - 2];
  if (anyVals.length === 1) return anyVals[0];

  return null;
}

function parseUpdated(html: string): string {
  const m = html.match(/Snow Report Last Updated:\s*([A-Za-z]{3}\s+\d{1,2})/);
  return m ? m[1] : new Date().toLocaleString();
}

export async function getOnTheSnowLast48(resort: Resort) {
  const slug = RESORT_PROVIDER_IDS.find((p: { id: string; onthesnow?: string }) => p.id === resort.id)?.onthesnow;
  if (!slug) return null;

  const url = `https://www.onthesnow.com/new-hampshire/${slug}/skireport`;
  const html = await fetchTextViaProxy(url);

  return {
    last48In: parseLast48FromRecentSnowfall(html),
    updatedAt: parseUpdated(html),
    sourceUrl: url,
  };
}
