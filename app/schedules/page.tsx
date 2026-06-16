import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ScheduleRowActions } from "@/components/ScheduleRowActions";
import type { Cadence } from "@/lib/types";

export default async function SchedulesPage() {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  const { data: schedules } = await supabase
    .from("schedules")
    .select(
      "id, prompt, parsed, cadence, next_run_at, last_run_at, enabled, origin_request_id, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6 pb-24">
      <header className="flex items-center justify-between mb-6">
        <Link href="/" className="text-sm text-ink-secondary hover:text-primary">
          ← Home
        </Link>
        <h1 className="font-bold">🔁 Recurring voyages</h1>
        <div className="w-10" />
      </header>

      {!schedules || schedules.length === 0 ? (
        <div className="card text-sm text-ink-secondary text-center py-10">
          No recurring voyages yet.
          <div className="mt-3">
            <Link href="/compose" className="btn btn-primary inline-block">
              ⚓ Chart a course
            </Link>
          </div>
          <p className="mt-3 text-xs">
            Pick a cadence on the review screen to make a voyage recurring.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {schedules.map((s) => {
            const parsed = (s.parsed as { intent?: string } | null) ?? null;
            const intent = parsed?.intent ?? s.prompt;
            const next = new Date(s.next_run_at).toLocaleString();
            const last = s.last_run_at
              ? new Date(s.last_run_at).toLocaleString()
              : null;
            return (
              <li key={s.id} className="card">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">
                        {intent}
                      </span>
                      <span className="pill pill-green">{s.cadence}</span>
                      {!s.enabled && (
                        <span className="pill pill-grey">paused</span>
                      )}
                    </div>
                    <div className="text-xs text-ink-secondary mt-1 truncate">
                      {s.prompt}
                    </div>
                    <div className="text-xs text-ink-secondary mt-1">
                      Next: {next}
                      {last && <> · Last: {last}</>}
                    </div>
                  </div>
                  <ScheduleRowActions
                    scheduleId={s.id}
                    enabled={s.enabled}
                    originRequestId={s.origin_request_id}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

// Avoid unused-import warning if we later remove the type — Cadence is used by
// the row-actions client component.
void (null as unknown as Cadence);
