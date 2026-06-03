import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseService } from "@/lib/supabase/server";
import { getFreeBusy } from "@/lib/google";
import { generateOptions } from "@/lib/generateOptions";
import { computeNextRunAt, isCadence, rollDateForward } from "@/lib/schedule";
import { sendProposalEmail } from "@/lib/email";
import type { Cadence, ParsedPrompt } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/run-schedules
 *
 * Triggered by Vercel Cron daily (see vercel.json). For each enabled schedule
 * whose `next_run_at` is in the past:
 *   1. Roll the parsed date range forward by the cadence.
 *   2. Pull FreeBusy across all of the user's calendars.
 *   3. Generate up to 3 candidate slots.
 *   4. Insert a fresh request + options (linked back to the schedule).
 *   5. Email the user a summary + share link.
 *   6. Bump next_run_at and last_run_at.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Vercel Cron passes
 * this header automatically when the `CRON_SECRET` env var is set on the project.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const svc = createSupabaseService();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await svc
    .from("schedules")
    .select("id, user_id, prompt, parsed, cadence, next_run_at")
    .lte("next_run_at", nowIso)
    .eq("enabled", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ ran: 0 });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const sched of due) {
    try {
      if (!isCadence(sched.cadence)) {
        throw new Error(`bad_cadence: ${sched.cadence}`);
      }
      const cadence: Cadence = sched.cadence;
      const baseParsed = sched.parsed as ParsedPrompt;

      // Roll the date range forward by the cadence so each cycle proposes a
      // fresh upcoming window. The day-of-week/time-of-day rules carry over.
      const parsed: ParsedPrompt = {
        ...baseParsed,
        date_range_start: rollDateForward(baseParsed.date_range_start, cadence),
        date_range_end: rollDateForward(baseParsed.date_range_end, cadence),
      };

      const busy = await getFreeBusy(
        sched.user_id,
        new Date(parsed.date_range_start + "T00:00:00Z"),
        new Date(parsed.date_range_end + "T23:59:59Z"),
      );

      // We don't yet persist the user's IANA tz on their profile. UTC is a safe
      // fallback for slot generation — the time labels render in UTC for now;
      // we can store + thread tz when we add a profile setting.
      const tz = "UTC";
      const options = generateOptions(parsed, busy, 3, tz);

      const { data: reqRow, error: reqErr } = await svc
        .from("requests")
        .insert({
          user_id: sched.user_id,
          prompt: sched.prompt,
          parsed,
          schedule_id: sched.id,
        })
        .select("id, share_token")
        .single();
      if (reqErr || !reqRow) {
        throw new Error(`insert_request: ${reqErr?.message ?? "no_row"}`);
      }

      if (options.length > 0) {
        const optsToInsert = options.map((o, i) => ({
          request_id: reqRow.id,
          starts_at: o.starts_at,
          ends_at: o.ends_at,
          label: o.label,
          position: i + 1,
        }));
        const { error: optErr } = await svc.from("options").insert(optsToInsert);
        if (optErr) throw new Error(`insert_options: ${optErr.message}`);
      }

      const { data: profile } = await svc
        .from("profiles")
        .select("email, display_name")
        .eq("id", sched.user_id)
        .single();

      const shareUrl = `${appUrl}/invite/${reqRow.share_token}`;

      if (profile?.email) {
        try {
          await sendProposalEmail({
            to: profile.email,
            toName: profile.display_name,
            intent: parsed.intent,
            options,
            shareUrl,
            cadence,
            userTz: tz,
          });
        } catch (e) {
          // Don't fail the whole run because the email blew up.
          console.error("[cron] email failed for schedule", sched.id, e);
        }
      }

      const nextRun = computeNextRunAt(cadence, new Date(sched.next_run_at));
      await svc
        .from("schedules")
        .update({
          next_run_at: nextRun.toISOString(),
          last_run_at: nowIso,
        })
        .eq("id", sched.id);

      results.push({ id: sched.id, ok: true });
    } catch (e) {
      console.error("[cron] schedule failed", sched.id, e);
      results.push({
        id: sched.id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ ran: results.length, results });
}
