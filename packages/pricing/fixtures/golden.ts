/**
 * Plan section 4 golden figures (whole naira), computed from the prototype's
 * own data. The pricing tests check them against the fixture and the db tests
 * check them against the seeded database.
 */
export const GOLDEN_KITS = [
  {
    slug: 'skin',
    name: 'Skincare Reseller Kit',
    price: 125_000,
    cost: 131_000,
    retail: 248_000,
    profit: 123_000,
    margin: 50,
    units: 82,
    gap: 6_000,
  },
  {
    slug: 'leather',
    name: 'Leather Gifting Kit',
    price: 98_000,
    cost: 104_000,
    retail: 221_000,
    profit: 123_000,
    margin: 56,
    units: 36,
    gap: 6_000,
  },
  {
    slug: 'pharm',
    name: 'Health Corner Kit',
    price: 125_000,
    cost: 133_800,
    retail: 244_800,
    profit: 119_800,
    margin: 49,
    units: 70,
    gap: 8_800,
  },
  {
    slug: 'phone',
    name: 'Phone Accessories Starter',
    price: 215_000,
    cost: 228_000,
    retail: 425_000,
    profit: 210_000,
    margin: 49,
    units: 90,
    gap: 13_000,
  },
  {
    slug: 'fashion',
    name: 'Menswear Basics Kit',
    price: 124_000,
    cost: 130_800,
    retail: 264_000,
    profit: 140_000,
    margin: 53,
    units: 36,
    gap: 6_800,
  },
  {
    slug: 'snack',
    name: 'Snack Box Kit',
    price: 75_000,
    cost: 79_000,
    retail: 150_000,
    profit: 75_000,
    margin: 50,
    units: 140,
    gap: 4_000,
  },
  {
    slug: 'home',
    name: 'Home Cleaning Kit',
    price: 62_000,
    cost: 64_800,
    retail: 132_000,
    profit: 70_000,
    margin: 53,
    units: 60,
    gap: 2_800,
  },
] as const;

export const SHORT_KIT_NAMES: Record<string, string> = {
  home: 'Home Cleaning',
  snack: 'Snack Box',
  leather: 'Leather Gifting',
  fashion: 'Menswear',
  skin: 'Skincare',
  pharm: 'Health Corner',
  phone: 'Phone Accessories',
};

/** Freedom number top 5 by goal (naira). */
export const GOLDEN_GOALS: [number, string][] = [
  [50_000, 'Home Cleaning 1, Snack Box 1, Leather Gifting 1, Menswear 1, Skincare 1'],
  [100_000, 'Leather Gifting 1, Menswear 1, Skincare 1, Health Corner 1, Phone Accessories 1'],
  [250_000, 'Menswear 2, Phone Accessories 2, Leather Gifting 3, Skincare 3, Health Corner 3'],
  [500_000, 'Phone Accessories 3, Menswear 4, Leather Gifting 5, Skincare 5, Health Corner 5'],
];
