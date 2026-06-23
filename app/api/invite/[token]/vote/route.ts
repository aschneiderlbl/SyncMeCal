import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseService } from "@/lib/supabase/server";
import { sendAyeNotificationEmail } from "@/lib/email";
import type { ParsedPrompt } from "@/lib/types";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  option_id: z.string().uuid().nullable(),       // null = rough_seas without a target option
  voter_name: z.string().min(1).max(80),
  voter_email: z.string().email().max(200).optional().nullable(),
  choice: z.enum(["aye", "rough_seas"]),
});

/**
 * POST /api/invite/[token]/vote
 *
 * Body: { option_id, voter_name, voter_email?, choice }
 *
 * Records a matey's vote. A matey can Aye Aye on multiple options — each
 * (option_id, voter_name) pair is independently togglable: a second Aye on
 * the same option removes the vote. Rough Seas is a per-vote insert as well
 * (the matey is signaling "none of these work").
 *
 * Anchoring is now a separate explicit action by the captain — see
 * /api/requests/[id]/anchor. Once anchored, new votes are rejected.
 *
 * Uses service-role since the matey isn't authenticated.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const body = BodySchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: body.error.format() },
      { status: 400 },
    );
  }

  const svc = createSupabaseService();

  const { data: request, error: reqErr } = await svc
    .from("requests")
    .select("id, user_id, prompt, parsed, status, scheduled_option_id")
    .eq("share_token", params.token)
    .single();

  if (reqErr || !request) {
    return NextResponse.json({ error: "request_not_found" }, { status: 404 });
  }

  if (request.status === "anchor_dropped") {
    return NextResponse.json(
      { error: "already_anchored", scheduled_option_id: request.scheduled_option_id },
      { status: 409 },
    );
  }

  // For 'aye' we require an option_id (you can't anchor without picking a slot).
  if (body.data.choice === "aye" && !body.data.option_id) {
    return NextResponse.json({ error: "option_required_for_aye" }, { status: 400 });
  }

  // Validate the option belongs to this request.
  if (body.data.option_id) {
    const { data: opt } = await svc
      .from("options")
      .select("id, request_id")
      .eq("id", body.data.option_id)
      .single();
    if (!opt || opt.request_id !== request.id) {
      return NextResponse.json({ error: "option_mismatch" }, { status: 400 });
    }
  }

  // Toggle behavior for Aye: if this matey already aye'd this option, remove
  // the vote. Otherwise insert it.
  if (body.data.choice === "aye" && body.data.option_id) {
    const { data: existing } = await svc
      .from("votes")
      .select("id")
      .eq("request_id", request.id)
      .eq("option_id", body.data.option_id)
      .eq("voter_name", body.data.voter_name)
      .eq("choice", "aye")
      .maybeSingle();

    if (existing) {
      await svc.from("votes").delete().eq("id", existing.id);
      return NextResponse.json({ ok: true, action: "removed" });
    }
  }

  // Insert the vote (Aye or Rough Seas).
  const { error: voteErr } = await svc.from("votes").insert({
    request_id: request.id,
    option_id: body.data.option_id,
    voter_name: body.data.voter_name,
    voter_email: body.data.voter_email ?? null,
    choice: body.data.choice,
  });
  if (voteErr) {
    return NextResponse.json({ error: voteErr.message }, { status: 500 });
  }

  // Notify the captain of new Ayes (best-effort).
  if (body.data.choice === "aye" && body.data.option_id) {
    try {
      const [{ data: profile }, { data: opt }] = await Promise.all([
        svc
          .from("profiles")
          .select("email, display_name")
          .eq("id", request.user_id)
          .single(),
        svc
          .from("options")
          .select("starts_at, label")
          .eq("id", body.data.option_id)
          .single(),
      ]);

      if (profile?.email && opt) {
        const parsed = (request.parsed as ParsedPrompt | null) ?? null;
        const intent = parsed?.intent ?? request.prompt;
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
        await sendAyeNotificationEmail({
          to: profile.email,
          toName: profile.display_name,
          intent,
          voterName: body.data.voter_name,
          voterEmail: body.data.voter_email ?? null,
          optionLabel: opt.label,
          optionStartsAt: opt.starts_at,
          requestUrl: `${appUrl}/requests/${request.id}`,
        });
      }
    } catch (e) {
      console.error("[vote] aye notification email failed", e);
    }
  }

  return NextResponse.json({ ok: true, action: "added" });
}
