import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseService } from "@/lib/supabase/server";
import type { InvitePublicPayload } from "@/lib/types";

/**
 * GET /api/invite/[token]
 *
 * Public — no auth required. Looks up a request by its share_token, joins the
 * captain's display name from profiles, and returns the data needed to render
 * the Fleet Board. Uses the service-role client to bypass RLS.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const svc = createSupabaseService();

  const { data: req, error: reqErr } = await svc
    .from("requests")
    .select("id, prompt, parsed, status, scheduled_option_id, user_id")
    .eq("share_token", params.token)
    .single();

  if (reqErr || !req) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: options } = await svc
    .from("options")
    .select("id, starts_at, ends_at, label, position")
    .eq("request_id", req.id)
    .order("position");

  // Pull Aye votes for the social-proof counts on the Fleet Board.
  const { data: ayes } = await svc
    .from("votes")
    .select("option_id, voter_name")
    .eq("request_id", req.id)
    .eq("choice", "aye");

  const ayesByOption = new Map<string, string[]>();
  for (const v of ayes ?? []) {
    if (!v.option_id) continue;
    const arr = ayesByOption.get(v.option_id) ?? [];
    arr.push(v.voter_name);
    ayesByOption.set(v.option_id, arr);
  }

  const { data: profile } = await svc
    .from("profiles")
    .select("display_name")
    .eq("id", req.user_id)
    .single();

  const captainName = (profile?.display_name ?? "Your captain").split(" ")[0];

  const payload: InvitePublicPayload = {
    request: {
      id: req.id,
      prompt: req.prompt,
      intent: (req.parsed as { intent?: string } | null)?.intent ?? null,
      captain_name: captainName,
      status: req.status,
      scheduled_option_id: req.scheduled_option_id,
    },
    options: (options ?? []).map((o) => {
      const names = ayesByOption.get(o.id) ?? [];
      return {
        id: o.id,
        starts_at: o.starts_at,
        ends_at: o.ends_at,
        label: o.label,
        position: o.position,
        aye_count: names.length,
        aye_voter_names: names,
      };
    }),
  };

  return NextResponse.json(payload);
}
