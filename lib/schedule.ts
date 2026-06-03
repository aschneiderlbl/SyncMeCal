import type { Cadence } from "@/lib/types";

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "weekly",
  monthly: "monthly",
  quarterly: "quarterly",
};

export function isCadence(s: unknown): s is Cadence {
  return s === "weekly" || s === "monthly" || s === "quarterly";
}

export function cadenceLabel(c: Cadence): string {
  return CADENCE_LABEL[c];
}

/**
 * Compute the next fire time given a cadence and a starting moment.
 * Uses calendar arithmetic (Date#setMonth handles overflow) so monthly/
 * quarterly preserve the day-of-month where possible.
 */
export function computeNextRunAt(cadence: Cadence, from: Date = new Date()): Date {
  const d = new Date(from);
  switch (cadence) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
  }
  return d;
}

/**
 * Roll a YYYY-MM-DD date forward by one cadence interval.
 * Used by the cron to shift the parsed date range each cycle.
 */
export function rollDateForward(yyyymmdd: string, cadence: Cadence): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  switch (cadence) {
    case "weekly":
      dt.setUTCDate(dt.getUTCDate() + 7);
      break;
    case "monthly":
      dt.setUTCMonth(dt.getUTCMonth() + 1);
      break;
    case "quarterly":
      dt.setUTCMonth(dt.getUTCMonth() + 3);
      break;
  }
  return dt.toISOString().slice(0, 10);
}
