import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { CopyButtonClient } from "@/components/CopyButtonClient";

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  const { data: req } = await supabase
    .from("requests")
    .select("id, prompt, parsed, status, share_token, scheduled_option_id")
    .eq("id", params.id)
    .single();

  if (!req) return notFound();

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
            const ayes = (votes ?? []).filter((v) => v.option_id === o.id && v.choice === "aye");
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
                </div>
                {isAnchor ? (
                  <span className="pill pill-green">⚓ Anchor dropped</span>
                ) : ayes.length > 0 ? (
                  <span className="pill pill-green">{ayes.length} aye</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6">
        <h3 className="font-semibold mb-2">Mateys&apos; calls</h3>
        {!votes || votes.length === 0 ? (
          <div className="card text-sm text-ink-secondary text-center py-6">No votes yet.</div>
        ) : (
          <ul className="space-y-2">
            {votes.map((v) => (
              <li key={v.id} className="card flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-primary text-white grid place-items-center text-xs font-bold">
                  {v.voter_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <span className="font-semibold">{v.voter_name}</span>{" "}
                  <span className="text-ink-secondary">
                    {v.choice === "aye" ? "called Aye Aye" : "called Rough Seas"}
                  </span>
                </div>
                <span className={v.choice === "aye" ? "pill pill-green" : "pill pill-amber"}>
                  {v.choice === "aye" ? "Aye aye" : "Rough seas"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
