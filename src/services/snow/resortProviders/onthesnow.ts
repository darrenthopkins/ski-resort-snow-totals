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
  // Anchor around Recent Snowfall section to avoid picking up arbitrary attribute width="59"
  const section =
    between(html, '### Recent Snowfall', '### Forecasted Snow') ??
    between(html, 'Recent Snowfall', 'Forecasted Snow');

  if (!section) return null;

  // Extract inches values formatted like 0", 0.5", 12"
  // Avoid HTML attributes by requiring the quote not be immediately preceded by '='
  const nums = [...section.matchAll(/(?<![=])(\d+(?:\.\d+)?)"/g)]
    .map(m => Number(m[1]))
    .filter(n => Number.isFinite(n));

  if (nums.length < 2) return null;

  // last two values ~ last 48h
  return nums[nums.length - 1] + nums[nums.length - 2];
}

function parseUpdated(html: string): string {
  const m = html.match(/Snow Report Last Updated:\s*([A-Za-z]{3}\s+\d{1,2})/);
  return m ? m[1] : new Date().toLocaleString();
}

export async function getOnTheSnowLast48(resort: Resort) {

  const slug = RESORT_PROVIDER_IDS.find(p => p.id === resort.id)?.onthesnow;
  if (!slug) return null;

  const url = `https://www.onthesnow.com/new-hampshire/${slug}/skireport`;
  const html = await fetchTextViaProxy(url);

  return {
    last48In: parseLast48FromRecentSnowfall(html),
    updatedAt: parseUpdated(html),
    sourceUrl: url,
  };
}
