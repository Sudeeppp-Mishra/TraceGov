/**
 * Relative-time helpers shared by the notification bell, inbox, and activity feeds.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact relative time: "just now", "5m", "2h", "3d". */
export function timeAgo(dateLike) {
  const diff = Date.now() - new Date(dateLike).getTime();
  if (Number.isNaN(diff) || diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  return `${Math.floor(diff / DAY)}d`;
}

/** Dwell duration since a file arrived at a desk: "<1h", "2h", "3d 4h". */
export function dwellLabel(dateLike) {
  const diff = Date.now() - new Date(dateLike).getTime();
  if (Number.isNaN(diff) || diff < HOUR) return '<1h';
  const days = Math.floor(diff / DAY);
  const hours = Math.floor((diff % DAY) / HOUR);
  if (days === 0) return `${hours}h`;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}
