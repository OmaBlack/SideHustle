'use client';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from '../format.js';

export interface Slide {
  id: string;
  content: ReactNode;
}

export interface SlideshowProps {
  slides: readonly Slide[];
  label: string;
  /** FR-HOME-02: ~5.5 seconds. */
  intervalMs?: number;
  labels: {
    previous: string;
    next: string;
    pause: string;
    play: string;
    /** "Slide {n} of {total}" */
    slide: string;
  };
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * APG carousel (plan section 9, FR-HOME-01..03): auto-advances, pauses on hover,
 * focus and touch, resumes after inactivity, never auto-advances under
 * reduced motion, and has prev/next, labelled dots, a rotation button and
 * arrow keys.
 */
export function Slideshow({ slides, label, intervalMs = 5500, labels }: SlideshowProps) {
  const id = useId();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [held, setHeld] = useState(false);
  const [reduced, setReduced] = useState(false);
  const resume = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = slides.length;

  useEffect(() => setReduced(prefersReducedMotion()), []);
  const go = useCallback((n: number) => setIndex(((n % count) + count) % count), [count]);

  const rotating = playing && !held && !reduced && count > 1;
  useEffect(() => {
    if (!rotating) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(t);
  }, [rotating, count, intervalMs]);

  const hold = () => {
    if (resume.current) clearTimeout(resume.current);
    setHeld(true);
  };
  const release = (afterMs = 0) => {
    if (resume.current) clearTimeout(resume.current);
    resume.current = setTimeout(() => setHeld(false), afterMs);
  };
  useEffect(() => () => void (resume.current && clearTimeout(resume.current)), []);

  if (count === 0) return null;
  const btn =
    'grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-line bg-surface text-ink';
  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className="relative flex flex-col gap-2"
      onMouseEnter={hold}
      onMouseLeave={() => release()}
      onFocus={hold}
      onBlur={() => release(4000)}
      onTouchStart={hold}
      onTouchEnd={() => release(6000)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1);
        if (e.key === 'ArrowLeft') go(index - 1);
      }}
    >
      <div
        id={`${id}-items`}
        aria-live={rotating ? 'off' : 'polite'}
        className="overflow-hidden rounded-card"
      >
        {slides.map((s, i) => (
          <div
            key={s.id}
            role="group"
            aria-roledescription="slide"
            aria-label={labels.slide.replace('{n}', String(i + 1)).replace('{total}', String(count))}
            hidden={i !== index}
          >
            {s.content}
          </div>
        ))}
      </div>
      {count > 1 && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className={btn}
            aria-label={playing ? labels.pause : labels.play}
            onClick={() => setPlaying((p) => !p)}
          >
            <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
          </button>
          <div className="flex items-center gap-1">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={labels.slide.replace('{n}', String(i + 1)).replace('{total}', String(count))}
                aria-current={i === index ? 'true' : undefined}
                aria-controls={`${id}-items`}
                className="grid h-11 w-8 cursor-pointer place-items-center border-0 bg-transparent"
                onClick={() => go(i)}
              >
                <span className={cx('h-2 rounded-full', i === index ? 'w-5 bg-accent' : 'w-2 bg-line')} />
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              className={btn}
              aria-label={labels.previous}
              aria-controls={`${id}-items`}
              onClick={() => go(index - 1)}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              className={btn}
              aria-label={labels.next}
              aria-controls={`${id}-items`}
              onClick={() => go(index + 1)}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
