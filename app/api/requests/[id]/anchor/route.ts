import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";

const BodySchema = z.object({
  option_id: z.string().uuid().nullable(),
});

/**
 * POST /api/requests/[id]/anchor
 *
 * Body: { option_id }
 *
 * Captain-only. Locks the request to a specific option (or clears the anchor
 * if option_id is null). RLS enforces ownership — only the request's owner
 * can change it.
 */
export async function POST(
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

  const body = BodySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: body.error.format() },
      { status: 400 },
    );
  }

  const { option_id } = body.data;

  // If anchoring (not clearing), make sure the option belongs to this request.
  if (option_id) {
    const { data: opt } = await supabase
      .from("options")
      .select("id, request_id")
      .eq("id", option_id)
      .single();
    if (!opt || opt.request_id !== params.id) {
      return NextResponse.json({ error: "option_mismatch" }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("requests")
    .update({
      scheduled_option_id: option_id,
      status: option_id ? "anchor_dropped" : "open",
    })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id, status, scheduled_option_id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "not_found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ request: data });
}
