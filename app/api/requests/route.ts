import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";

const BodySchema = z.object({
  prompt: z.string().min(2).max(500),
  parsed: z.unknown(),
  options: z
    .array(
      z.object({
        starts_at: z.string(),
        ends_at: z.string(),
        label: z.string(),
      }),
    )
    .min(1),
});

/**
 * POST /api/requests
 * Persists a new scheduling request + its options. Returns { id, share_token }.
 */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const body = BodySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "invalid_body", issues: body.error.format() }, { status: 400 });
  }

  const { prompt, parsed, options } = body.data;

  const { data: reqRow, error: reqErr } = await supabase
    .from("requests")
    .insert({ user_id: user.id, prompt, parsed })
    .select("id, share_token")
    .single();

  if (reqErr || !reqRow) {
    return NextResponse.json({ error: reqErr?.message ?? "insert_failed" }, { status: 500 });
  }

  const optsToInsert = options.map((o, i) => ({
    request_id: reqRow.id,
    starts_at: o.starts_at,
    ends_at: o.ends_at,
    label: o.label,
    position: i + 1,
  }));

  const { error: optErr } = await supabase.from("options").insert(optsToInsert);
  if (optErr) {
    return NextResponse.json({ error: optErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: reqRow.id, share_token: reqRow.share_token });
}
