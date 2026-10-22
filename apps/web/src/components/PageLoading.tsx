import { Skeleton } from '@sidehustle/ui';

/** Loading state shaped like a list page: one status message for screen readers, skeleton blocks for everyone else. */
export function PageLoading({ text, rows = 3 }: { text: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="sr-only">
        {text}
      </p>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}
