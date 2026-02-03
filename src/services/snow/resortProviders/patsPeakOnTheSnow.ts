import { fetchTextViaProxy } from '../../http/fetchViaProxy';

const URL = 'https://www.onthesnow.com/new-hampshire/pats-peak/skireport'\;

function parseLast48(html: string): number | null {
  const idx = html.indexOf('Recent Snowfall');
  if (idx < 0) return null;

  const slice = html.slice(idx, idx + 1500);

  const nums = [...slice.matchAll(/(\d+(?:\.\d+)?)"/g)]
    .map(m => Number(m[1]))
    .filter(n => Number.isFinite(n));

  if (nums.length < 2) return null;

  // last two entries ≈ last 48h
  return nums[nums.length - 1] + nums[nums.length - 2];
}

function parseUpdated(html: string): string {
  const m = html.match(/Snow Report Last Updated:\s*([A-Za-z]{3}\s+\d{1,2})/);
  return m ? m[1] : new Date().toLocaleString();
}

export async function getPatsPeakLast48() {
  const html = await fetchTextViaProxy(URL);

  return {
    last48In: parseLast48(html),
    updatedAt: parseUpdated(html),
    sourceUrl: URL,
  };
}
