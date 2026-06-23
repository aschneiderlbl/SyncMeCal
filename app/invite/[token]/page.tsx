"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InvitePublicPayload } from "@/lib/types";

type Status =
  | "loading"
  | "ready"
  | "saving"
  | "anchored"
  | "done"
  | "rough_seas_done"
  | "error";

const NAME_STORAGE_KEY = "syncmecal:matey_name";
const EMAIL_STORAGE_KEY = "syncmecal:matey_email";

/**
 * Matey-facing invite page.
 *
 * Flow:
 *   1. Tap any options that work — toggled in local state only, nothing posted.
 *   2. Or tap "None of these work" to switch to rough-seas mode.
 *   3. Enter name + (optional) email.
 *   4. Hit Save — one POST to /api/invite/[token]/picks reconciles all picks.
 */
export default function InvitePage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<InvitePublicPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [anchoredOption, setAnchoredOption] = useState<string | null>(null);

  // Pick state — entirely client-side until Save.
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [roughSeas, setRoughSeas] = useState(false);

  const [voterName, setVoterName] = useState("");
  const [voterEmail, setVoterEmail] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setVoterName(window.localStorage.getItem(NAME_STORAGE_KEY) ?? "");
    setVoterEmail(window.localStorage.getItem(EMAIL_STORAGE_KEY) ?? "");
  }, []);

  const loadInvite = useCallback(async () => {
    const r = await fetch(`/api/invite/${params.token}`, { cache: "no-store" });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error ?? "Failed to load");
    setData(json);
    if (json.request.status === "anchor_dropped") {
      setAnchoredOption(json.request.scheduled_option_id);
      setStatus("anchored");
    } else {
      setStatus("ready");
    }
  }, [params.token]);

  useEffect(() => {
    (async () => {
      try {
        await loadInvite();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    })();
  }, [loadInvite]);

  // When the saved name matches existing aye votes, pre-check those options so
  // a returning matey sees what they previously picked.
  useEffect(() => {
    if (!data || !voterName.trim()) return;
    const norm = voterName.trim().toLowerCase();
    const mine = new Set<string>();
    for (const o of data.options) {
      if (o.aye_voter_names.some((n) => n.trim().toLowerCase() === norm)) {
        mine.add(o.id);
      }
    }
    if (mine.size > 0) {
      setPicks(mine);
      setRoughSeas(false);
    }
    // Only run on initial data load — don't fight the user as they toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.request?.id]);

  function togglePick(optionId: string) {
    setRoughSeas(false);
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  }

  function toggleRoughSeas() {
    setRoughSeas((prev) => {
      const next = !prev;
      if (next) setPicks(new Set()); // mutually exclusive with picks
      return next;
    });
  }

  async function save() {
    if (!data) return;
    if (!voterName.trim()) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NAME_STORAGE_KEY, voterName.trim());
      if (voterEmail.trim())
        window.localStorage.setItem(EMAIL_STORAGE_KEY, voterEmail.trim());
    }

    setStatus("saving");
    setError(null);
    try {
      const body = roughSeas
        ? {
            voter_name: voterName.trim(),
            voter_email: voterEmail.trim() || null,
            mode: "rough_seas" as const,
            option_ids: [] as string[],
          }
        : {
            voter_name: voterName.trim(),
            voter_email: voterEmail.trim() || null,
            mode: "aye_list" as const,
            option_ids: [...picks],
          };

      const r = await fetch(`/api/invite/${params.token}/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Save failed");

      setStatus(roughSeas ? "rough_seas_done" : "done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("ready");
    }
  }

  if (status === "loading") {
    return (
      <main className="min-h-screen grid place-items-center p-6 text-ink-secondary">
        Loading…
      </main>
    );
  }

  if (status === "error" || !data) {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div className="card max-w-sm text-center">
          <div className="text-3xl mb-2">🚫</div>
          <div className="font-semibold">Couldn't load this invite</div>
          <p className="text-sm text-ink-secondary mt-1">{error}</p>
        </div>
      </main>
    );
  }

  // Captain has locked the meeting — show the chosen time.
  if (status === "anchored") {
    const anchored = data.options.find((o) => o.id === anchoredOption);
    return (
      <main
        className="min-h-screen grid place-items-center p-6"
        style={{
          background:
            "linear-gradient(180deg, #DBEAFE 0%, #93C5FD 30%, #3B82F6 65%, #1E3A8A 100%)",
        }}
      >
        <div className="text-center">
          <div className="text-6xl">🎯</div>
          <h1 className="text-3xl font-extrabold text-white mt-4 drop-shadow">
            Anchor dropped!
          </h1>
          <p className="text-white/90 mt-2 max-w-sm mx-auto">
            {anchored ? (
              <>
                {data.request.captain_name} anchored on{" "}
                <strong>{anchored.label}</strong>.
              </>
            ) : (
              "Anchor dropped."
            )}
          </p>
          <div className="card mt-6 max-w-sm mx-auto text-left">
            <div className="font-semibold text-sm">⚓ Locked in</div>
            <div className="text-xs text-ink-secondary mt-1">
              Calendar invite coming soon.
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Save succeeded — Aye list.
  if (status === "done") {
    const myAyes = data.options.filter((o) => picks.has(o.id));
    return (
      <main
        className="min-h-screen grid place-items-center p-6"
        style={{
          background:
            "linear-gradient(180deg, #DBEAFE 0%, #93C5FD 30%, #3B82F6 65%, #1E3A8A 100%)",
        }}
      >
        <div className="text-center max-w-sm">
          <div className="text-6xl">⚓</div>
          <h1 className="text-3xl font-extrabold text-white mt-4 drop-shadow">
            Picks sent!
          </h1>
          <p className="text-white/90 mt-2">
            {data.request.captain_name} will pick the final time from your
            picks.
          </p>
          {myAyes.length > 0 && (
            <div className="card mt-6 text-left">
              <div className="text-xs font-bold text-primary uppercase tracking-wider mb-2">
                Your picks
              </div>
              <ul className="space-y-1 text-sm">
                {myAyes.map((o) => (
                  <li key={o.id}>• {o.label}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={() => setStatus("ready")}
            className="btn btn-secondary mt-4 w-full"
          >
            Change my picks
          </button>
        </div>
      </main>
    );
  }

  // Save succeeded — rough seas.
  if (status === "rough_seas_done") {
    return (
      <main
        className="min-h-screen grid place-items-center p-6"
        style={{
          background:
            "linear-gradient(180deg, #DBEAFE 0%, #93C5FD 35%, #3B82F6 70%, #1E40AF 100%)",
        }}
      >
        <div className="text-center">
          <div className="text-6xl">🌊</div>
          <h1 className="text-3xl font-extrabold text-white mt-4 drop-shadow">
            Rough seas!
          </h1>
          <p className="text-white/90 mt-2 max-w-sm mx-auto">
            We'll let {data.request.captain_name} know none of these times work.
            They'll chart a new course.
          </p>
          <button
            type="button"
            onClick={() => {
              setRoughSeas(false);
              setStatus("ready");
            }}
            className="btn btn-secondary mt-6"
          >
            Change my mind
          </button>
        </div>
      </main>
    );
  }

  const canSave =
    voterName.trim().length > 0 && (roughSeas || picks.size > 0);
  const summary = useSummaryLine(picks.size, roughSeas);

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6 pb-44">
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-2 bg-bg px-3 py-1 rounded-full text-xs text-ink-secondary mb-3">
          <span className="w-5 h-5 rounded-full bg-primary text-white grid place-items-center text-[10px] font-bold">
            {data.request.captain_name.charAt(0).toUpperCase()}
          </span>
          Incoming from {data.request.captain_name}
        </div>
        <h1 className="text-2xl font-bold">
          {data.request.intent ?? data.request.prompt}
        </h1>
      </div>

      {/* Instructions */}
      <div className="card mb-4 border-primary" style={{ background: "#EFF6FF" }}>
        <div className="text-xs font-bold text-primary uppercase tracking-wider mb-1">
          ✅ Check every time that works
        </div>
        <p className="text-sm">
          <strong>Pick as many as you can</strong> — the more options you mark,
          the easier it is for {data.request.captain_name} to find a time. When
          you're done, fill out your name below and save.
        </p>
      </div>

      {/* Options with checkboxes */}
      <div className="space-y-2">
        {data.options.map((o) => {
          const checked = picks.has(o.id);
          const otherAyes = o.aye_voter_names.filter(
            (n) =>
              !voterName.trim() ||
              n.trim().toLowerCase() !== voterName.trim().toLowerCase(),
          );
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => togglePick(o.id)}
              disabled={status === "saving"}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                checked
                  ? "border-cta bg-cta-light shadow-lift"
                  : "border-border bg-white hover:border-primary hover:-translate-y-0.5"
              } ${roughSeas ? "opacity-40" : ""}`}
            >
              <div
                className={`w-9 h-9 rounded-lg grid place-items-center border-2 flex-shrink-0 transition-all ${
                  checked
                    ? "bg-cta border-cta text-white"
                    : "bg-white border-border text-transparent"
                }`}
              >
                <span className="text-xl font-extrabold leading-none">✓</span>
              </div>

              <div className="flex-1 text-left min-w-0">
                <div className="font-semibold text-base">{o.label}</div>
                <div className="text-xs text-ink-secondary mt-0.5">
                  {new Date(o.starts_at).toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
                {otherAyes.length > 0 && (
                  <div className="text-[11px] text-ink-secondary mt-1">
                    {otherAyes.length}{" "}
                    {otherAyes.length === 1 ? "matey" : "mateys"} already in:{" "}
                    {otherAyes.join(", ")}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Rough seas alternative */}
      <button
        type="button"
        onClick={toggleRoughSeas}
        disabled={status === "saving"}
        className={`w-full flex items-center gap-3 p-3 mt-3 rounded-2xl border-2 transition-all ${
          roughSeas
            ? "border-danger bg-red-50"
            : "border-border bg-white hover:border-danger"
        }`}
      >
        <div
          className={`w-9 h-9 rounded-lg grid place-items-center border-2 flex-shrink-0 ${
            roughSeas
              ? "bg-danger border-danger text-white"
              : "bg-white border-border text-transparent"
          }`}
        >
          <span className="text-xl font-extrabold leading-none">✓</span>
        </div>
        <div className="flex-1 text-left">
          <div className="font-semibold text-sm">🌊 None of these work</div>
          <div className="text-xs text-ink-secondary">
            Tell {data.request.captain_name} to chart a new course.
          </div>
        </div>
      </button>

      {/* Sticky save bar with name + email + button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-border p-4 shadow-lg">
        <div className="max-w-2xl mx-auto">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              type="text"
              value={voterName}
              onChange={(e) => setVoterName(e.target.value)}
              placeholder="Your name *"
              className="p-3 rounded-xl border-2 border-border focus:border-primary outline-none text-sm"
            />
            <input
              type="email"
              value={voterEmail}
              onChange={(e) => setVoterEmail(e.target.value)}
              placeholder="Email (optional)"
              className="p-3 rounded-xl border-2 border-border focus:border-primary outline-none text-sm"
            />
          </div>
          {error && <div className="text-xs text-danger mb-2">{error}</div>}
          <button
            type="button"
            onClick={save}
            disabled={!canSave || status === "saving"}
            className="btn btn-primary w-full text-sm"
          >
            {status === "saving"
              ? "Saving…"
              : !voterName.trim()
                ? "Enter your name to save"
                : summary}
          </button>
        </div>
      </div>
    </main>
  );
}

function useSummaryLine(pickCount: number, roughSeas: boolean): string {
  return useMemo(() => {
    if (roughSeas) return "🌊 Send rough seas";
    if (pickCount === 0) return "Pick at least one time";
    return `✅ Save ${pickCount} ${pickCount === 1 ? "pick" : "picks"}`;
  }, [pickCount, roughSeas]);
}
