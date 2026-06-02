import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { parsePromptWithClaude } from "@/lib/parsePrompt";
import { getFreeBusy } from "@/lib/google";
import { generateOptions } from "@/lib/generateOptions";

const BodySchema = z.object({
  prompt: z.string().min(2).max(500),
  // IANA timezone of the client (e.g. "America/Chicago"). Falls back to UTC if
  // the client doesn't send it — older clients won't break.
  tz: z.string().min(1).max(64).optional(),
});

/**
 * POST /api/generate-options
 *
 * Body: { prompt }
 * Pipeline:
 *   1. Parse prompt with Claude → structured rules
 *   2. Call Google FreeBusy for the user over the date range
 *   3. Run generateOptions to pick 3 candidate slots
 *
 * Returns { parsed, options } so the client can show a review screen
 * before persisting (we save in /api/requests).
 */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const body = BodySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  let parsed;
  try {
    parsed = await parsePromptWithClaude(body.data.prompt);
  } catch (e) {
    return NextResponse.json(
      { error: `parse_failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  let busy;
  try {
    busy = await getFreeBusy(
      user.id,
      new Date(parsed.date_range_start + "T00:00:00"),
      new Date(parsed.date_range_end + "T23:59:59"),
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: `freebusy_failed: ${e instanceof Error ? e.message : String(e)}`,
        hint: "If this says 'Google not connected', sign out and sign back in to grant calendar access.",
      },
      { status: 500 },
    );
  }

  const tz = body.data.tz ?? "UTC";
  const options = generateOptions(parsed, busy, 3, tz);

  return NextResponse.json({ parsed, options, busy_count: busy.length, tz });
}
