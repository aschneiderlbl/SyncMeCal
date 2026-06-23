import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseService } from "@/lib/supabase/server";
import { sendAyePicksEmail } from "@/lib/email";
import type { ParsedPrompt } from "@/lib/types";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  voter_name: z.string().min(1).max(80),
  voter_email: z.string().email().max(200).optional().nullable(),
  mode: z.enum(["aye_list", "rough_seas"]),
  option_ids: z.array(z.string().uuid()).default([]),
});

/**
 * POST /api/invite/[token]/picks
 *
 * Bulk-reconcile a matey's votes in a single call. Replaces the per-tap
 * toggle flow with a "pick everything that works, then save" flow.
 *
 * Body:
 *   { voter_name, voter_email?, mode: "aye_list", option_ids: [uuid, ...] }
 *   { voter_name, voter_email?, mode: "rough_seas", option_ids: [] }
 *
 * Behavior:
 *   - Deletes the voter's existing rows for this request
 *   - Inserts the new state (Ayes for each option, or one Rough Seas row)
 *   - Sends one summary email to the captain listing newly-added picks
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
    .select("id, user_id, prompt, parsed, status, share_token")
    .eq("share_token", params.token)
    .single();
  if (reqErr || !request) {
    return NextResponse.json({ error: "request_not_found" }, { status: 404 });
  }
  if (request.status === "anchor_dropped") {
    return NextResponse.json({ error: "already_anchored" }, { status: 409 });
  }

  // Validate every option_id belongs to this request before touching the DB.
  if (body.data.mode === "aye_list" && body.data.option_ids.length > 0) {
    const { data: opts } = await svc
      .from("options")
      .select("id")
      .eq("request_id", request.id)
      .in("id", body.data.option_ids);
    if (!opts || opts.length !== body.data.option_ids.length) {
      return NextResponse.json({ error: "option_mismatch" }, { status: 400 });
    }
  }

  // Read existing votes by this voter so we can compute "added" vs "removed"
  // for the email summary, and so we can wipe them before inserting fresh.
  const { data: existing } = await svc
    .from("votes")
    .select("id, option_id, choice")
    .eq("request_id", request.id)
    .eq("voter_name", body.data.voter_name);

  const previousAyeOptionIds = new Set(
    (existing ?? [])
      .filter((v) => v.choice === "aye" && v.option_id)
      .map((v) => v.option_id as string),
  );

  const newAyeOptionIds =
    body.data.mode === "aye_list" ? new Set(body.data.option_ids) : new Set<string>();

  const addedAyeOptionIds = [...newAyeOptionIds].filter(
    (id) => !previousAyeOptionIds.has(id),
  );

  // Wipe existing votes for this voter on this request.
  if ((existing ?? []).length > 0) {
    await svc
      .from("votes")
      .delete()
      .in(
        "id",
        (existing ?? []).map((v) => v.id),
      );
  }

  // Insert the new state.
  if (body.data.mode === "rough_seas") {
    const { error: insErr } = await svc.from("votes").insert({
      request_id: request.id,
      option_id: null,
      voter_name: body.data.voter_name,
      voter_email: body.data.voter_email ?? null,
      choice: "rough_seas",
    });
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  } else if (body.data.option_ids.length > 0) {
    const rows = body.data.option_ids.map((option_id) => ({
      request_id: request.id,
      option_id,
      voter_name: body.data.voter_name,
      voter_email: body.data.voter_email ?? null,
      choice: "aye",
    }));
    const { error: insErr } = await svc.from("votes").insert(rows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  // Send a single summary email to the captain — only when there's something
  // new to tell them about (skip on no-op edits and on toggle-offs).
  if (addedAyeOptionIds.length > 0) {
    try {
      const [{ data: profile }, { data: pickedOpts }] = await Promise.all([
        svc
          .from("profiles")
          .select("email, display_name")
          .eq("id", request.user_id)
          .single(),
        svc
          .from("options")
          .select("id, starts_at, label")
          .in("id", addedAyeOptionIds),
      ]);
      if (profile?.email && pickedOpts && pickedOpts.length > 0) {
        const parsed = (request.parsed as ParsedPrompt | null) ?? null;
        const intent = parsed?.intent ?? request.prompt;
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
        await sendAyePicksEmail({
          to: profile.email,
          intent,
          voterName: body.data.voter_name,
          voterEmail: body.data.voter_email ?? null,
          picks: pickedOpts.map((o) => ({
            label: o.label,
            starts_at: o.starts_at,
          })),
          requestUrl: `${appUrl}/requests/${request.id}`,
        });
      }
    } catch (e) {
      console.error("[picks] summary email failed", e);
    }
  }

  // Return the updated aye state for every option so the client can rerender.
  const { data: refreshedVotes } = await svc
    .from("votes")
    .select("option_id, voter_name")
    .eq("request_id", request.id)
    .eq("choice", "aye");

  const ayesByOption = new Map<string, string[]>();
  for (const v of refreshedVotes ?? []) {
    if (!v.option_id) continue;
    const arr = ayesByOption.get(v.option_id) ?? [];
    arr.push(v.voter_name);
    ayesByOption.set(v.option_id, arr);
  }

  return NextResponse.json({
    ok: true,
    mode: body.data.mode,
    options: Array.from(ayesByOption.entries()).map(([id, names]) => ({
      id,
      aye_voter_names: names,
      aye_count: names.length,
    })),
  });
}
