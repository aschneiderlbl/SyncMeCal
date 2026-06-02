import type { FreeBusyWindow } from "@/lib/google";
import type { GeneratedOption, ParsedPrompt, TimeOfDay, Weekday } from "@/lib/types";

const WEEKDAY_INDEX: Record<Weekday, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

// Local hours considered "in window" for each time-of-day bucket.
const TIME_WINDOWS: Record<TimeOfDay, [number, number]> = {
  morning: [7, 11],
  afternoon: [12, 17],
  evening: [17, 21],
  any: [8, 18],
};

/**
 * Convert a wall-clock time (year, month, day, hour, minute) in the given
 * IANA timezone to a UTC Date. DST-aware via Intl.DateTimeFormat.
 *
 * We need this because on Vercel the JS runtime is UTC, so plain `setHours()`
 * silently means "set the UTC hour" — which is NOT what we want when the
 * scheduling algorithm thinks in terms of the user's local clock.
 */
function zonedTimeToUtc(
  year: number,
  month: number, // 0-indexed (to match Date.UTC)
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  // Treat the wall-clock components as if they were UTC. Then ask Intl what
  // that instant LOOKS LIKE in `tz`, and the gap between the two tells us the
  // tz offset at that instant.
  const wallAsUtcMs = Date.UTC(year, month, day, hour, minute);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(wallAsUtcMs))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  // Some locales emit "24" for midnight — normalize.
  const h = parts.hour === "24" ? "00" : parts.hour;
  const observedMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(h),
    Number(parts.minute),
    Number(parts.second),
  );
  // tz offset at this instant, in ms (positive east of UTC).
  const tzOffsetMs = observedMs - wallAsUtcMs;
  // The UTC instant whose tz-rendered wall-clock equals what we asked for.
  return new Date(wallAsUtcMs - tzOffsetMs);
}

/**
 * Given parsed rules + the user's busy windows over the date range,
 * propose up to N candidate slots.
 *
 * Algorithm (deliberately simple — easy to iterate on):
 *   1. Walk each calendar date in [date_range_start, date_range_end].
 *   2. If preferred_days is set, skip days that don't match.
 *   3. Within each day's [winStart, winEnd] hour window (in the user's tz),
 *      sweep in 15-min steps.
 *   4. A slot of `duration_minutes` is a candidate if it overlaps no busy window
 *      AND doesn't cross 12:00–13:00 local (a soft "don't book over lunch" rule).
 *   5. Score by closeness to the middle of the window + earliness in the date range.
 *   6. Return the top N.
 */
export function generateOptions(
  parsed: ParsedPrompt,
  busy: FreeBusyWindow[],
  N = 3,
  tz: string = "UTC",
): GeneratedOption[] {
  const [sy, sm, sd] = parsed.date_range_start.split("-").map(Number);
  const [ey, em, ed] = parsed.date_range_end.split("-").map(Number);
  // Use UTC anchor dates just to iterate calendar dates — the day-of-week of a
  // calendar date doesn't depend on tz.
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  const duration = parsed.duration_minutes * 60_000;
  const durationHours = parsed.duration_minutes / 60;

  const [winStart, winEnd] = TIME_WINDOWS[parsed.preferred_time_of_day];
  const allowedDays = new Set(parsed.preferred_days.map((d) => WEEKDAY_INDEX[d]));

  const busyRanges = busy
    .map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as const)
    .sort((a, b) => a[0] - b[0]);

  const overlapsBusy = (s: number, e: number) =>
    busyRanges.some(([bs, be]) => s < be && e > bs);

  const candidates: { start: Date; end: Date; score: number }[] = [];

  for (let ms = startMs; ms <= endMs; ms += 86_400_000) {
    const cur = new Date(ms);
    const y = cur.getUTCFullYear();
    const m = cur.getUTCMonth(); // 0-indexed
    const d = cur.getUTCDate();
    const dow = cur.getUTCDay();

    if (allowedDays.size > 0 && !allowedDays.has(dow)) continue;

    for (let hour = winStart; hour <= winEnd; hour += 0.25) {
      const endHourLocal = hour + durationHours;
      if (endHourLocal > winEnd + 0.5) break;

      // Don't book straight through lunch.
      const startsBeforeNoon = hour < 12;
      const endsAfter1pm = endHourLocal >= 13;
      if (startsBeforeNoon && endsAfter1pm) continue;

      const hh = Math.floor(hour);
      const mm = Math.round((hour % 1) * 60);
      const slotStart = zonedTimeToUtc(y, m, d, hh, mm, tz);
      const slotEnd = new Date(slotStart.getTime() + duration);

      if (overlapsBusy(slotStart.getTime(), slotEnd.getTime())) continue;

      const daysFromStart = Math.floor((ms - startMs) / 86_400_000);
      const midWindow = (winStart + winEnd) / 2;
      const distFromMid = Math.abs(hour - midWindow);
      const score = daysFromStart * 2 + distFromMid;
      candidates.push({ start: slotStart, end: slotEnd, score });
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  // Compute the calendar date (in the user's tz) for a Date, so "same day"
  // means the same calendar day on the user's clock — not a 24-hour window
  // that might straddle midnight in their tz.
  const dateKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  // Strict pass: at most one pick per calendar date (in user tz). Most prompts
  // want variety across days, not multiple options on the same day.
  const picked: { start: Date; end: Date }[] = [];
  const pickedDates = new Set<string>();
  for (const c of candidates) {
    if (picked.length >= N) break;
    const k = dateKey(c.start);
    if (pickedDates.has(k)) continue;
    picked.push({ start: c.start, end: c.end });
    pickedDates.add(k);
  }

  // Top-up: ONLY if the entire candidate pool is on a single calendar date
  // (e.g. a "find time tomorrow" prompt). Otherwise return fewer options
  // rather than doubling up days the user already has.
  if (picked.length < N) {
    const uniqueDates = new Set(candidates.map((c) => dateKey(c.start)));
    if (uniqueDates.size <= 1) {
      for (const c of candidates) {
        if (picked.length >= N) break;
        if (!picked.find((p) => p.start.getTime() === c.start.getTime())) {
          picked.push({ start: c.start, end: c.end });
        }
      }
    }
  }

  return picked.map((p) => ({
    starts_at: p.start.toISOString(),
    ends_at: p.end.toISOString(),
    label: labelFor(p.start, parsed.preferred_time_of_day, tz),
  }));
}

function labelFor(d: Date, tod: TimeOfDay, tz: string): string {
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
  const todTxt =
    tod === "morning" ? "morning"
    : tod === "afternoon" ? "afternoon"
    : tod === "evening" ? "evening"
    : "";
  return `${weekday}, ${date} · ${time}${todTxt ? ` (${todTxt})` : ""}`;
}
