import { cx } from '../format.js';

/** Category slug → token colour, so cards are colour-coded (SRS 4.1). */
export const CATEGORY_COLOR: Record<string, string> = {
  beauty: 'var(--c-beauty)',
  fashion: 'var(--c-fashion)',
  health: 'var(--c-health)',
  phone: 'var(--c-phone)',
  food: 'var(--c-food)',
  home: 'var(--c-home)',
};

export function categoryColor(slug?: string | null): string {
  return (slug && CATEGORY_COLOR[slug]) || 'var(--accent)';
}

// Simple silhouettes keyed by the prototype's shape names; unknown keys fall back to a box.
const SHAPES: Record<string, string> = {
  tub: 'M14 22h36v28a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4zM12 16h40v6H12z',
  jar: 'M18 20h28v30a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4zM20 12h24v8H20z',
  dropper: 'M26 24h12v28a6 6 0 0 1-12 0zM29 10h6v14h-6z',
  pump: 'M22 26h20v26a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4zM29 14h6v12h-6zM29 14h12v4H29z',
  spray: 'M22 26h20v26a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4zM26 16h12v10H26zM38 18h8v4h-8z',
  bar: 'M12 26h40v14a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z',
  gallon: 'M16 20h32v32a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4zM34 10h10v10H34z',
  tote: 'M12 24h40l-4 30H16zM22 24a10 10 0 0 1 20 0',
  bag: 'M12 24h40l-4 30H16zM22 24a10 10 0 0 1 20 0',
  crossbody: 'M16 30h32v20a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4zM20 30L32 10l12 20',
  pack: 'M18 12h28l-2 42H20z',
  chips: 'M18 12h28l-2 42H20z',
  earbuds:
    'M20 22a8 8 0 1 1 0 16a8 8 0 0 1 0-16zM44 22a8 8 0 1 1 0 16a8 8 0 0 1 0-16zM18 38h4v14h-4zM42 38h4v14h-4z',
  powerbank: 'M20 10h24v44H20z',
  charger: 'M20 22h24v22H20zM26 12h4v10h-4zM34 12h4v10h-4z',
  firstaid: 'M12 20h40v32H12zM28 26h8v8h8v8h-8v8h-8v-8h-8v-8h8z',
  blister: 'M14 16h36v32H14z',
};

export interface ProductArtProps {
  shape?: string | null;
  category?: string | null;
  /** Decorative by default; pass a label when the art is the only image of the product. */
  label?: string;
  className?: string;
}

/** Inline SVG fallback used until a product has a photo (plan section 9). */
export function ProductArt({ shape, category, label, className }: ProductArtProps) {
  const d = (shape && SHAPES[shape]) || 'M14 18h36v32a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z';
  const color = categoryColor(category);
  return (
    <svg
      viewBox="0 0 64 64"
      className={cx('block', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <rect width="64" height="64" rx="12" style={{ fill: 'var(--sunk)' }} />
      <path d={d} style={{ fill: color }} opacity="0.85" />
    </svg>
  );
}
