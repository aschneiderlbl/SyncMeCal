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
 * Given parsed rules + the user's busy windows over the date range,
 * propose up to N candidate slots.
 *
 * Algorithm (deliberately simple — easy to iterate on):
 *   1. Walk each day in [date_range_start, date_range_end].
 *   2. If preferred_days is set, skip days that don't match.
 *   3. Within each day's [winStart, winEnd] hour window, sweep in 15-min steps.
 *   4. A slot of `duration_minutes` is a candidate if it overlaps no busy window
 *      AND doesn't cross 12:00–13:00 (a soft "don't book over lunch" rule).
 *   5. Score by closeness to the middle of the window + earliness in the date range
 *      (people generally want the soonest reasonable time).
 *   6. Return the top N.
 */
export function generateOptions(
  parsed: ParsedPrompt,
  busy: FreeBusyWindow[],
  N = 3,
): GeneratedOption[] {
  const start = new Date(parsed.date_range_start + "T00:00:00");
  const end = new Date(parsed.date_range_end + "T23:59:59");
  const duration = parsed.duration_minutes * 60_000;

  const [winStart, winEnd] = TIME_WINDOWS[parsed.preferred_time_of_day];
  const allowedDays = new Set(parsed.preferred_days.map((d) => WEEKDAY_INDEX[d]));

  const busyRanges = busy
    .map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as const)
    .sort((a, b) => a[0] - b[0]);

  const overlapsBusy = (s: number, e: number) =>
    busyRanges.some(([bs, be]) => s < be && e > bs);

  const candidates: { start: Date; end: Date; score: number }[] = [];

  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    if (allowedDays.size > 0 && !allowedDays.has(day.getDay())) continue;

    // Sweep 15-min steps from winStart to winEnd - duration.
    for (let hour = winStart; hour <= winEnd; hour += 0.25) {
      const slotStart = new Date(day);
      slotStart.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + duration);

      if (slotEnd.getHours() + slotEnd.getMinutes() / 60 > winEnd + 0.5) break;

      // Don't book straight through lunch.
      const startsBeforeNoon = slotStart.getHours() < 12;
      const endsAfter1pm = slotEnd.getHours() >= 13;
      if (startsBeforeNoon && endsAfter1pm) continue;

      if (overlapsBusy(slotStart.getTime(), slotEnd.getTime())) continue;

      // Score: prefer earlier dates (smaller daysFromStart), prefer mid-window times.
      const daysFromStart = Math.floor(
        (slotStart.getTime() - start.getTime()) / 86_400_000,
      );
      const midWindow = (winStart + winEnd) / 2;
      const distFromMid = Math.abs(
        slotStart.getHours() + slotStart.getMinutes() / 60 - midWindow,
      );
      const score = daysFromStart * 2 + distFromMid;
      candidates.push({ start: new Date(slotStart), end: slotEnd, score });
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  // Greedy pick top N with at least 1 day between picks (variety).
  const picked: { start: Date; end: Date }[] = [];
  for (const c of candidates) {
    if (picked.length >= N) break;
    const tooClose = picked.some(
      (p) => Math.abs(p.start.getTime() - c.start.getTime()) < 86_400_000,
    );
    if (!tooClose) picked.push({ start: c.start, end: c.end });
  }
  // If we don't have N yet (rare — narrow range), top up without the diversity rule.
  for (const c of candidates) {
    if (picked.length >= N) break;
    if (!picked.find((p) => p.start.getTime() === c.start.getTime())) {
      picked.push({ start: c.start, end: c.end });
    }
  }

  return picked.map((p) => ({
    starts_at: p.start.toISOString(),
    ends_at: p.end.toISOString(),
    label: labelFor(p.start, parsed.preferred_time_of_day),
  }));
}

function labelFor(d: Date, tod: TimeOfDay): string {
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const todTxt =
    tod === "morning" ? "morning"
    : tod === "afternoon" ? "afternoon"
    : tod === "evening" ? "evening"
    : "";
  return `${weekday}, ${date} · ${time}${todTxt ? ` (${todTxt})` : ""}`;
}
