import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";

const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  cadence: z.enum(["weekly", "monthly", "quarterly"]).optional(),
});

/**
 * PATCH /api/schedules/[id]
 * Body: { enabled?, cadence? }
 *
 * Pause/resume with `enabled`, or change the cadence. Changing cadence does
 * NOT re-anchor `next_run_at` — the next fire still happens at the previously
 * computed time; only subsequent cycles use the new cadence.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const body = PatchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: body.error.format() },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {};
  if (body.data.enabled !== undefined) update.enabled = body.data.enabled;
  if (body.data.cadence !== undefined) update.cadence = body.data.cadence;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_fields_to_update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("schedules")
    .update(update)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id, cadence, next_run_at, enabled")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "not_found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ schedule: data });
}

/**
 * DELETE /api/schedules/[id]
 * Removes the schedule. Existing past requests stay; their schedule_id is set
 * to null via ON DELETE SET NULL.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const { error } = await supabase
    .from("schedules")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
