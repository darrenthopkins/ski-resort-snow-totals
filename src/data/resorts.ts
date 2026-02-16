export type Resort = {
  id: string;
  name: string;
  state: "NH" | "MA" | "VT" | "ME" | "NY";
  lat: number;
  lon: number;
};

export type ResortProviderIds = {
  id: string;
  onthesnow?: string;
};

export const RESORTS: Resort[] = [
  {
    id: "waterville",
    name: "Waterville Valley",
    state: "NH",
    lat: 43.9506,
    lon: -71.5006,
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
];

export const RESORT_PROVIDER_IDS: ResortProviderIds[] = [
  { id: "waterville", onthesnow: "waterville-valley" },
  { id: "gunstock", onthesnow: "gunstock" },
  { id: "sunapee", onthesnow: "mount-sunapee" },
  { id: "ragged", onthesnow: "ragged-mountain-resort" },
  { id: "patspeak", onthesnow: "pats-peak" },
];
