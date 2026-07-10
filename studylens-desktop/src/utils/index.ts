import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges Tailwind class names without conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format seconds into a human-readable duration string like "2h 30m" */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** Strips HTML tags from a string for preview text */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

/** Format a timeframe key for display */
export function formatTimeframe(tf: string): string {
  return tf.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}
