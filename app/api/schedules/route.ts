import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { computeNextRunAt, isCadence } from "@/lib/schedule";
import type { ParsedPrompt } from "@/lib/types";

const PostSchema = z.object({
  request_id: z.string().uuid(),
  cadence: z.enum(["weekly", "monthly", "quarterly"]),
});

/**
 * POST /api/schedules
 *
 * Body: { request_id, cadence }
 *
 * Creates a recurring schedule attached to an existing request. The schedule
 * snapshots the request's prompt + parsed rules and rolls them forward each
 * cycle. The first auto-run fires one cadence interval from now.
 */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const body = PostSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: body.error.format() },
      { status: 400 },
    );
  }

  const { request_id, cadence } = body.data;

  const { data: reqRow, error: reqErr } = await supabase
    .from("requests")
    .select("id, prompt, parsed, schedule_id")
    .eq("id", request_id)
    .single();

  if (reqErr || !reqRow) {
    return NextResponse.json({ error: "request_not_found" }, { status: 404 });
  }
  if (reqRow.schedule_id) {
    return NextResponse.json(
      { error: "already_scheduled", schedule_id: reqRow.schedule_id },
      { status: 409 },
    );
  }
  if (!reqRow.parsed) {
    return NextResponse.json(
      { error: "request_missing_parsed" },
      { status: 400 },
    );
  }

  const nextRun = computeNextRunAt(cadence, new Date());

  const { data: sched, error: schedErr } = await supabase
    .from("schedules")
    .insert({
      user_id: user.id,
      prompt: reqRow.prompt,
      parsed: reqRow.parsed as ParsedPrompt,
      cadence,
      next_run_at: nextRun.toISOString(),
      origin_request_id: reqRow.id,
    })
    .select("id, cadence, next_run_at, enabled")
    .single();

  if (schedErr || !sched) {
    return NextResponse.json(
      { error: schedErr?.message ?? "insert_failed" },
      { status: 500 },
    );
  }

  // Link the originating request back to the schedule so the detail page
  // can show "recurring" status without an extra query.
  await supabase
    .from("requests")
    .update({ schedule_id: sched.id })
    .eq("id", reqRow.id);

  return NextResponse.json({ schedule: sched });
}

/**
 * GET /api/schedules
 * Returns the signed-in user's schedules. (Currently used by the detail page
 * to show schedule state, and is convenient for future a /schedules list page.)
 */
export async function GET() {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("schedules")
    .select(
      "id, prompt, cadence, next_run_at, last_run_at, enabled, origin_request_id, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedules: data });
}
// Suppress unused-import lint if isCadence isn't used directly here — it's
// re-exported for symmetry with the [id] route.
void isCadence;
