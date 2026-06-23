import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { CopyButtonClient } from "@/components/CopyButtonClient";
import { ScheduleControls } from "@/components/ScheduleControls";
import { AnchorButton } from "@/components/AnchorButton";
import type { Cadence } from "@/lib/types";

// Always render fresh so vote counts reflect the latest invite activity.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type VoteRow = {
  id: string;
  option_id: string | null;
  voter_name: string;
  choice: string;
  created_at: string;
};
type OptionRow = {
  id: string;
  position: number;
};
type VoterGroup = {
  voter_name: string;
  aye_coords: string[];     // e.g. ["A1", "B2"]
  rough_seas: boolean;
  last_at: string;
};

/**
 * Roll vote rows up by voter so the captain can scan "who picked what" at a
 * glance instead of reading a flat chronological log.
 */
function groupVotesByVoter(
  votes: VoteRow[],
  options: OptionRow[],
): VoterGroup[] {
  const coordOf = new Map(
    options.map((o, i) => [
      o.id,
      `${String.fromCharCode(65 + i)}${i + 1}`,
    ]),
  );

  const byVoter = new Map<string, VoterGroup>();
  for (const v of votes) {
    const existing =
      byVoter.get(v.voter_name) ?? {
        voter_name: v.voter_name,
        aye_coords: [],
        rough_seas: false,
        last_at: v.created_at,
      };
    if (v.choice === "aye" && v.option_id) {
      const c = coordOf.get(v.option_id);
      if (c && !existing.aye_coords.includes(c)) existing.aye_coords.push(c);
    } else if (v.choice === "rough_seas") {
      existing.rough_seas = true;
    }
    if (new Date(v.created_at) > new Date(existing.last_at)) {
      existing.last_at = v.created_at;
    }
    byVoter.set(v.voter_name, existing);
  }

  // Sort by last activity, most recent first.
  return Array.from(byVoter.values()).sort(
    (a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime(),
  );
}

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  const { data: req } = await supabase
    .from("requests")
    .select("id, prompt, parsed, status, share_token, scheduled_option_id, schedule_id")
    .eq("id", params.id)
    .single();

  if (!req) return notFound();

  // If this request is linked to a schedule, pull its current state so the
  // ScheduleControls component can render the right UI (status vs picker).
  let schedule: {
    id: string;
    cadence: Cadence;
    next_run_at: string;
    enabled: boolean;
  } | null = null;
  if (req.schedule_id) {
    const { data: sched } = await supabase
      .from("schedules")
      .select("id, cadence, next_run_at, enabled")
      .eq("id", req.schedule_id)
      .single();
    if (sched) {
      schedule = {
        id: sched.id,
        cadence: sched.cadence as Cadence,
        next_run_at: sched.next_run_at,
        enabled: sched.enabled,
      };
    }
  }

  const { data: options } = await supabase
    .from("options")
    .select("id, starts_at, ends_at, label, position")
    .eq("request_id", params.id)
    .order("position");

  const { data: votes } = await supabase
    .from("votes")
    .select("id, option_id, voter_name, choice, created_at")
    .eq("request_id", params.id)
    .order("created_at", { ascending: false });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const shareUrl = `${appUrl}/invite/${req.share_token}`;

  const parsed = (req.parsed as { intent?: string } | null) ?? null;

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6 pb-24">
      <header className="flex items-center justify-between mb-6">
        <Link href="/" className="text-sm text-ink-secondary hover:text-primary">← Home</Link>
        <h1 className="font-bold truncate">{parsed?.intent ?? req.prompt}</h1>
        <div className="w-10" />
      </header>

      <section className="mb-4">
        <ScheduleControls requestId={req.id} schedule={schedule} />
      </section>

      <section className="card">
        <div className="text-xs font-bold text-primary uppercase tracking-wider mb-1">Share link</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-bg p-2 rounded-lg border border-border break-all">{shareUrl}</code>
          <CopyButtonClient text={shareUrl} />
        </div>
        <p className="text-xs text-ink-secondary mt-2">
          Send this to yer mateys. They'll see the same Fleet Board and shout Aye Aye on a time.
        </p>
      </section>

      <section className="mt-6">
        <h3 className="font-semibold mb-2">Proposed times</h3>
        <ul className="space-y-2">
          {options?.map((o, i) => {
            const ayes = (votes ?? []).filter(
              (v) => v.option_id === o.id && v.choice === "aye",
            );
            const ayeNames = ayes.map((v) => v.voter_name);
            const isAnchor = req.scheduled_option_id === o.id;
            return (
              <li
                key={o.id}
                className={`card flex items-center gap-3 ${
                  isAnchor ? "!border-cta !bg-cta-light" : ""
                }`}
              >
                <div className="w-11 h-11 rounded-lg bg-primary text-white grid place-items-center font-bold font-mono">
                  {String.fromCharCode(65 + i)}
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{o.label}</div>
                  <div className="text-xs text-ink-secondary">
                    {new Date(o.starts_at).toLocaleString()}
                  </div>
                  {ayeNames.length > 0 && (
                    <div className="text-xs text-ink-secondary mt-1">
                      <span className="font-semibold text-primary">
                        Ayes:
                      </span>{" "}
                      {ayeNames.join(", ")}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isAnchor ? (
                    <span className="pill pill-green">⚓ Anchor dropped</span>
                  ) : ayes.length > 0 ? (
                    <span className="pill pill-green">
                      {ayes.length} aye{ayes.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {req.status !== "cancelled" && (
                    <AnchorButton
                      requestId={req.id}
                      optionId={o.id}
                      variant={isAnchor ? "unanchor" : "anchor"}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6">
        <h3 className="font-semibold mb-2">Mateys&apos; calls</h3>
        {!votes || votes.length === 0 ? (
          <div className="card text-sm text-ink-secondary text-center py-6">
            No votes yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {groupVotesByVoter(votes, options ?? []).map((g) => (
              <li key={g.voter_name} className="card text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary text-white grid place-items-center text-xs font-bold">
                    {g.voter_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{g.voter_name}</div>
                    {g.aye_coords.length > 0 ? (
                      <div className="text-xs text-ink-secondary mt-0.5">
                        Aye'd:{" "}
                        <span className="text-ink">
                          {g.aye_coords.join(", ")}
                        </span>
                      </div>
                    ) : null}
                    {g.rough_seas && (
                      <div className="text-xs text-amber-700 mt-0.5">
                        Called Rough Seas
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-ink-secondary whitespace-nowrap">
                    {new Date(g.last_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
