const PESO = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Normalizes narrow/non-breaking spaces ICU may emit before AM/PM. */
const clean = (s: string) => s.replace(/[\u202f\u00a0]/g, " ");

/** "₱1,234.50" */
export function formatPeso(n: number): string {
  return PESO.format(n).replace(/^(-?)[^\d\s-]+\s?/, "$1₱");
}

/** "Nov 3, 2026" (local time) */
export function formatDate(iso: string): string {
  return clean(DATE.format(new Date(iso)));
}

/** "2:22 PM" (local time) */
export function formatTime(iso: string): string {
  return clean(TIME.format(new Date(iso)));
}

/** "Nov 3, 2026 2:22 PM" */
export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

export function formatQueueNumber(value: string | number): string {
  const queueNumber = String(value).trim();
  const match = /^(?:\d{8}-)?A-(\d+)$/i.exec(queueNumber);
  const numeric =
    match?.[1] ?? (/^\d+$/.test(queueNumber) ? queueNumber : null);
  return numeric ? numeric.padStart(3, "0") : queueNumber;
}

/** Local "YYYY-MM-DD". */
export function toDayKey(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
