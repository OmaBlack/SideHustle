'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  text: string;
}
const ToastContext = createContext<(text: string) => void>(() => {});

/** Brief confirmation, e.g. "Added to cart" (FR-CART-04). Announced politely; no focus change. */
export function ToastProvider({ children, durationMs = 3500 }: { children: ReactNode; durationMs?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const show = useCallback(
    (text: string) => {
      const id = next.current++;
      setItems((xs) => [...xs.slice(-2), { id, text }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), durationMs);
    },
    [durationMs],
  );
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-36 z-50 md:bottom-8 flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <p
            key={t.id}
            className="rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-semibold text-bg shadow-lg"
          >
            {t.text}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/** Test helper and simple trigger: shows `text` once when mounted. */
export function ToastOnMount({ text }: { text: string }) {
  const show = useToast();
  useEffect(() => show(text), [show, text]);
  return null;
}
