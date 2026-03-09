// src/data/resorts.ts
// Canonical New England–centric resort universe.
// Deterministic, single source of truth.

export type Resort = {
  id: string;
  name: string;
  state: "NH" | "MA" | "VT" | "ME" | "NY";
  lat: number;
  lon: number;
};

export type ResortProviderIds = {
  id: string;
  onTheSnowUrl?: string;
  onTheSnowSlug?: string;
};

/**
 * Provider IDs
 * Include every resort you actively support scraping.
 * If a resort has no provider mapping, it simply won’t be fetched.
 */
export const RESORT_PROVIDER_IDS: ResortProviderIds[] = [
  // --- New Hampshire ---
  { id: "waterville", onTheSnowSlug: "waterville-valley" },
  { id: "loon", onTheSnowSlug: "loon-mountain" },
  { id: "cannon", onTheSnowSlug: "cannon-mountain" },
  { id: "brettonwoods", onTheSnowSlug: "bretton-woods" },
  { id: "wildcat", onTheSnowSlug: "wildcat-mountain" },
  { id: "attitash", onTheSnowSlug: "attitash" },
  { id: "cranmore", onTheSnowSlug: "cranmore" },
  { id: "blacknh", onTheSnowSlug: "black-mountain-nh" },
  { id: "gunstock", onTheSnowSlug: "gunstock" },
  { id: "sunapee", onTheSnowSlug: "mount-sunapee" },
  {
    id: "ragged",
    onTheSnowUrl:
      "https://www.onthesnow.com/new-hampshire/ragged-mountain-resort/skireport",
  },
  { id: "patspeak", onTheSnowSlug: "pats-peak" },
  { id: "kingpine", onTheSnowSlug: "king-pine" },
  { id: "tenney", onTheSnowSlug: "tenney-mountain" },
  // { id: "mcintyre", onTheSnowSlug: "mcintyre-ski-area" },

  // --- Maine ---
  { id: "sundayriver", onTheSnowSlug: "sunday-river" },
  { id: "sugarloaf", onTheSnowSlug: "sugarloaf" },
  { id: "shawneepeak", onTheSnowSlug: "pleasant-mountain" },

  // --- Vermont ---
  { id: "killington", onTheSnowSlug: "killington-resort" },
  { id: "okemo", onTheSnowSlug: "okemo-mountain-resort" },
  { id: "stratton", onTheSnowSlug: "stratton-mountain" },
  { id: "stowe", onTheSnowSlug: "stowe-mountain-resort" },
  { id: "jaypeak", onTheSnowSlug: "jay-peak" },

  // --- Massachusetts ---
  { id: "wachusett", onTheSnowSlug: "wachusett-mountain-ski-area" },
  { id: "berkshireeast", onTheSnowSlug: "berkshire-east" },
  { id: "nashoba", onTheSnowSlug: "nashoba-valley" },
  { id: "skibradford", onTheSnowSlug: "bradford-ski-area" },

  // --- New York ---
  { id: "whiteface", onTheSnowSlug: "whiteface-mountain-resort" },
];

/**
 * Canonical resort universe.
 * Expand freely — filtering to 110mi happens elsewhere.
 */
export const RESORTS: Resort[] = [
  // --- New Hampshire ---
  {
    id: "waterville",
    name: "Waterville Valley",
    state: "NH",
    lat: 43.9506,
    lon: -71.5006,
  },
  {
    id: "loon",
    name: "Loon Mountain",
    state: "NH",
    lat: 44.0369,
    lon: -71.6295,
  },
  {
    id: "cannon",
    name: "Cannon Mountain",
    state: "NH",
    lat: 44.1567,
    lon: -71.6984,
  },
  {
    id: "brettonwoods",
    name: "Bretton Woods",
    state: "NH",
    lat: 44.2595,
    lon: -71.4412,
  },
  {
    id: "wildcat",
    name: "Wildcat Mountain",
    state: "NH",
    lat: 44.2598,
    lon: -71.225,
  },
  {
    id: "attitash",
    name: "Attitash",
    state: "NH",
    lat: 44.0829,
    lon: -71.229,
  },
  {
    id: "cranmore",
    name: "Cranmore",
    state: "NH",
    lat: 44.0548,
    lon: -71.1286,
  },
  {
    id: "blacknh",
    name: "Black Mountain (NH)",
    state: "NH",
    lat: 44.3045,
    lon: -71.184,
  },
  {
    id: "gunstock",
    name: "Gunstock",
    state: "NH",
    lat: 43.5592,
    lon: -71.3665,
  },
  {
    id: "sunapee",
    name: "Mount Sunapee",
    state: "NH",
    lat: 43.3317,
    lon: -72.0784,
  },
  {
    id: "ragged",
    name: "Ragged Mountain",
    state: "NH",
    lat: 43.542,
    lon: -71.8903,
  },
  {
    id: "patspeak",
    name: "Pats Peak",
    state: "NH",
    lat: 43.1652,
    lon: -71.7926,
  },
  {
    id: "kingpine",
    name: "King Pine",
    state: "NH",
    lat: 43.8087,
    lon: -71.2904,
  },
  {
    id: "tenney",
    name: "Tenney Mountain",
    state: "NH",
    lat: 43.7587,
    lon: -71.6885,
  },
  // {
  //   id: "mcintyre",
  //   name: "McIntyre",
  //   state: "NH",
  //   lat: 42.9943,
  //   lon: -71.4936,
  // },

  // --- Maine ---
  {
    id: "sundayriver",
    name: "Sunday River",
    state: "ME",
    lat: 44.4735,
    lon: -70.8563,
  },
  {
    id: "sugarloaf",
    name: "Sugarloaf",
    state: "ME",
    lat: 45.0314,
    lon: -70.3131,
  },
  {
    id: "shawneepeak",
    name: "Pleasant Mountain",
    state: "ME",
    lat: 44.1463,
    lon: -70.8227,
  },

  // --- Vermont ---
  {
    id: "killington",
    name: "Killington",
    state: "VT",
    lat: 43.6045,
    lon: -72.8208,
  },
  {
    id: "okemo",
    name: "Okemo",
    state: "VT",
    lat: 43.4019,
    lon: -72.7176,
  },
  {
    id: "stratton",
    name: "Stratton",
    state: "VT",
    lat: 43.1142,
    lon: -72.9107,
  },
  {
    id: "stowe",
    name: "Stowe",
    state: "VT",
    lat: 44.5314,
    lon: -72.7803,
  },
  {
    id: "jaypeak",
    name: "Jay Peak",
    state: "VT",
    lat: 44.9369,
    lon: -72.5042,
  },

  // --- Massachusetts ---
  {
    id: "wachusett",
    name: "Wachusett",
    state: "MA",
    lat: 42.4883,
    lon: -71.886,
  },
  {
    id: "berkshireeast",
    name: "Berkshire East",
    state: "MA",
    lat: 42.6201,
    lon: -72.9195,
  },
  {
    id: "nashoba",
    name: "Nashoba Valley",
    state: "MA",
    lat: 42.5215,
    lon: -71.4581,
  },
  {
    id: "skibradford",
    name: "Ski Bradford",
    state: "MA",
    lat: 42.7437,
    lon: -71.1057,
  },

  // --- New York ---
  {
    id: "whiteface",
    name: "Whiteface",
    state: "NY",
    lat: 44.3659,
    lon: -73.9023,
  },
];
