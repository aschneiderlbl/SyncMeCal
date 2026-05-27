import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { CapnCal } from "@/components/CapnCal";

export default async function HomePage() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return redirect("/login");

  const { data: requests } = await supabase
    .from("requests")
    .select("id, prompt, status, created_at, parsed")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const firstName = (profile?.display_name ?? "Captain").split(" ")[0];

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6 pb-24">
      {/* Topbar */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <CapnCal size={48} />
          <div>
            <div className="text-xs text-ink-secondary">Good morning</div>
            <h1 className="text-xl font-bold leading-tight">{firstName}</h1>
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <button className="text-sm text-ink-secondary hover:text-primary" type="submit">
            Sign out
          </button>
        </form>
      </header>

      {/* Compose prompt hero */}
      <section className="card" style={{ background: "linear-gradient(180deg, #EFF6FF, #FFFFFF)", borderColor: "#DBEAFE" }}>
        <div className="text-xs font-bold text-primary uppercase tracking-wider">Ask Cap'n Cal</div>
        <h2 className="text-xl font-bold mt-1">What are you trying to schedule?</h2>
        <ComposePromptLink />
      </section>

      {/* Recent requests */}
      <section className="mt-8">
        <h3 className="font-semibold mb-3">Recent voyages</h3>
        {!requests || requests.length === 0 ? (
          <div className="card text-sm text-ink-secondary text-center py-8">
            No voyages yet. Tap "Chart a course" above to get started.
          </div>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/requests/${r.id}`}
                  className="card flex items-center gap-3 hover:border-primary transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary-light grid place-items-center text-xl">
                    {emojiFor(r.parsed as { intent?: string } | null)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">
                      {(r.parsed as { intent?: string } | null)?.intent ?? r.prompt}
                    </div>
                    <div className="text-xs text-ink-secondary truncate">{r.prompt}</div>
                  </div>
                  <StatusPill status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ComposePromptLink() {
  return (
    <Link href="/compose" className="btn btn-primary w-full mt-3">
      ⚓ Chart a course
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "anchor_dropped") return <span className="pill pill-green">⚓ Anchor dropped</span>;
  if (status === "cancelled") return <span className="pill pill-grey">Cancelled</span>;
  return <span className="pill pill-amber">Open</span>;
}

function emojiFor(parsed: { intent?: string } | null): string {
  const t = (parsed?.intent ?? "").toLowerCase();
  if (t.includes("coffee")) return "☕";
  if (t.includes("golf")) return "⛳";
  if (t.includes("dinner") || t.includes("lunch")) return "🍽";
  if (t.includes("drink") || t.includes("beer")) return "🍺";
  if (t.includes("meeting") || t.includes("board")) return "💼";
  return "📅";
}
