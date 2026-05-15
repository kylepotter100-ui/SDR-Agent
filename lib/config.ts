/**
 * Discovery configuration for the SDR agent.
 *
 * Pure data, no logic. Editing this file changes the geographic and
 * vertical scope of the pipeline. New postcodes or SIC codes go here —
 * never hard-coded inside agent modules.
 */

export type SicTier = 1 | 2 | 3 | 4 | 5 | 6;

export interface SicTierMeta {
  tier: SicTier;
  label: string;
  fitWeight: number;
  notes: string;
}

export interface SicCode {
  code: string;
  description: string;
  examples?: string;
  tier: SicTier;
}

/**
 * Postcode area prefixes (the alphabetic part before the first digit).
 * East Midlands core at launch. Likely future additions: LN, CV, B, S.
 */
export const POSTCODE_PREFIXES = ["LE", "NG", "DE", "NN"] as const;

export type PostcodePrefix = (typeof POSTCODE_PREFIXES)[number];

export const SIC_TIERS: readonly SicTierMeta[] = [
  {
    tier: 1,
    label: "Time/space/capacity booking",
    fitWeight: 1.0,
    notes: "Closest fit to the Potter Sanctuary archetype.",
  },
  {
    tier: 2,
    label: "Class and course shape",
    fitWeight: 0.9,
    notes: "Recurring scheduled classes with capacity-bound bookings.",
  },
  {
    tier: 3,
    label: "1:1 appointment shape",
    fitWeight: 0.7,
    notes: "Independent practitioners taking individual appointments.",
  },
  {
    tier: 4,
    label: "Trade & service",
    fitWeight: 0.6,
    notes: "Quote-then-schedule shape; website + CRM angle still fits.",
  },
  {
    tier: 5,
    label: "Creative services & hire",
    fitWeight: 0.8,
    notes: "Photography and recreational/personal hire.",
  },
  {
    tier: 6,
    label: "Event experiences",
    fitWeight: 0.5,
    notes: "Bookable private events.",
  },
];

export const SIC_CODES: readonly SicCode[] = [
  // Tier 1 — Time/space/capacity booking (weight 1.0)
  { code: "93110", description: "Operation of sports facilities", examples: "padel, tennis, climbing, 5-a-side", tier: 1 },
  { code: "93199", description: "Other sports activities n.e.c.", examples: "escape rooms, axe throwing, archery", tier: 1 },
  { code: "93290", description: "Other amusement and recreation activities n.e.c.", examples: "dog fields, soft play", tier: 1 },
  { code: "55209", description: "Other holiday and short-stay accommodation", examples: "glamping, shepherd huts", tier: 1 },
  { code: "55300", description: "Camping grounds, recreational vehicle parks", examples: "glamping sites", tier: 1 },
  { code: "96040", description: "Physical well-being activities", examples: "saunas, ice baths, wellness studios", tier: 1 },
  { code: "90030", description: "Artistic creation", examples: "independent ceramicists, potters, artists", tier: 1 },
  { code: "90040", description: "Operation of arts facilities", examples: "pottery studios, makerspaces, small galleries", tier: 1 },

  // Tier 2 — Class and course shape (weight 0.9)
  { code: "93130", description: "Fitness facilities", examples: "boutique gyms, pilates, CrossFit", tier: 2 },
  { code: "85510", description: "Sports and recreation education", examples: "swim schools, dance, climbing instruction", tier: 2 },
  { code: "85520", description: "Cultural education", examples: "music schools, art classes, drama, language", tier: 2 },
  { code: "85590", description: "Other education n.e.c.", examples: "tutoring, adult education, cookery schools", tier: 2 },

  // Tier 3 — 1:1 appointment shape (weight 0.7)
  { code: "96020", description: "Hairdressing and beauty", examples: "non-chain, independent only", tier: 3 },
  { code: "96090", description: "Other personal service activities", examples: "massage, reiki, hypnotherapy, coaching", tier: 3 },
  { code: "75000", description: "Veterinary activities", examples: "independent practices only", tier: 3 },
  { code: "86230", description: "Dental practice", examples: "independent dentists", tier: 3 },
  { code: "86900", description: "Other human health activities", examples: "physio, chiropractic, osteopath", tier: 3 },

  // Tier 4 — Trade & service (weight 0.6)
  { code: "43210", description: "Electrical installation", tier: 4 },
  { code: "43220", description: "Plumbing, heat, air-conditioning installation", tier: 4 },
  { code: "43290", description: "Other construction installation", tier: 4 },
  { code: "43320", description: "Joinery installation", tier: 4 },
  { code: "81210", description: "General cleaning of buildings", tier: 4 },
  { code: "81221", description: "Window cleaning", tier: 4 },
  { code: "81300", description: "Landscape service activities", examples: "gardeners", tier: 4 },
  { code: "45200", description: "Maintenance and repair of motor vehicles", examples: "independent garages", tier: 4 },

  // Tier 5 — Creative services & hire (weight 0.8)
  { code: "74201", description: "Portrait photographic activities", tier: 5 },
  { code: "74202", description: "Other specialist photography", tier: 5 },
  { code: "74209", description: "Other photographic activities", tier: 5 },
  { code: "77210", description: "Renting of recreational and sports goods", examples: "paddleboard, bike, kayak hire", tier: 5 },
  { code: "77290", description: "Renting of other personal and household goods", examples: "party hire, AV hire", tier: 5 },

  // Tier 6 — Event experiences (weight 0.5)
  { code: "56210", description: "Event catering", examples: "small private operators with bookable events", tier: 6 },
];

export const SIC_CODE_LIST: readonly string[] = SIC_CODES.map((c) => c.code);

export function tierMeta(tier: SicTier): SicTierMeta {
  const meta = SIC_TIERS.find((t) => t.tier === tier);
  if (!meta) throw new Error(`Unknown SIC tier: ${tier}`);
  return meta;
}

export function fitWeightForCode(code: string): number | null {
  const sic = SIC_CODES.find((c) => c.code === code);
  return sic ? tierMeta(sic.tier).fitWeight : null;
}
