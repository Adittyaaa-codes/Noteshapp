/** Full-page loader shown while lazy-loaded chunks are being fetched. */
export function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted gap-3">
      <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
      <p className="text-xs font-medium">Loading...</p>
    </div>
  );
}
