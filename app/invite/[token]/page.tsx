"use client";

import { useCallback, useEffect, useState } from "react";
import type { InvitePublicPayload } from "@/lib/types";

type Status =
  | "loading"
  | "ready"
  | "name_prompt"
  | "submitting"
  | "anchored"
  | "rough_seas"
  | "error";

// Persist the matey's name across reloads so they can keep toggling without
// re-typing it.
const NAME_STORAGE_KEY = "syncmecal:matey_name";
const EMAIL_STORAGE_KEY = "syncmecal:matey_email";

export default function InvitePage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<InvitePublicPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  // Which option the matey is queueing up to Aye before they've given a name.
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
  const [pendingChoice, setPendingChoice] = useState<"aye" | "rough_seas">("aye");
  const [voterName, setVoterName] = useState("");
  const [voterEmail, setVoterEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [anchoredOption, setAnchoredOption] = useState<string | null>(null);

  // Restore name + email from localStorage so repeat visits feel quick.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const n = window.localStorage.getItem(NAME_STORAGE_KEY) ?? "";
    const e = window.localStorage.getItem(EMAIL_STORAGE_KEY) ?? "";
    setVoterName(n);
    setVoterEmail(e);
  }, []);

  const loadInvite = useCallback(async () => {
    // no-store: never serve a cached invite payload, otherwise the user's own
    // freshly-cast vote disappears on the next render and the toggle flaps.
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

  function persistName() {
    if (typeof window === "undefined") return;
    if (voterName.trim()) window.localStorage.setItem(NAME_STORAGE_KEY, voterName.trim());
    if (voterEmail.trim()) window.localStorage.setItem(EMAIL_STORAGE_KEY, voterEmail.trim());
  }

  async function submitVote(choice: "aye" | "rough_seas", optionId: string | null) {
    if (!voterName.trim()) {
      setPendingOptionId(optionId);
      setPendingChoice(choice);
      setStatus("name_prompt");
      return;
    }
    persistName();
    setStatus("submitting");
    setError(null);
    try {
      const r = await fetch(`/api/invite/${params.token}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          option_id: optionId,
          voter_name: voterName.trim(),
          voter_email: voterEmail.trim() || null,
          choice,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Vote failed");

      if (choice === "rough_seas") {
        setStatus("rough_seas");
        return;
      }

      // Aye toggle: trust the POST's returned voter list (avoids a second GET
      // that Vercel's CDN was caching). Patch the affected option in place.
      if (
        json.option_id &&
        Array.isArray(json.aye_voter_names) &&
        data
      ) {
        const nextOptions = data.options.map((o) =>
          o.id === json.option_id
            ? {
                ...o,
                aye_voter_names: json.aye_voter_names as string[],
                aye_count:
                  typeof json.aye_count === "number"
                    ? json.aye_count
                    : (json.aye_voter_names as string[]).length,
              }
            : o,
        );
        setData({ ...data, options: nextOptions });
      }
      setStatus("ready");
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

  // Anchor-dropped — captain has locked the meeting time.
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

  // Rough seas — declined
  if (status === "rough_seas") {
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
        </div>
      </main>
    );
  }

  // Name prompt overlay
  const askingName = status === "name_prompt";

  // Compute "which options has THIS matey aye'd" by comparing names (no auth).
  const myNameNorm = voterName.trim().toLowerCase();
  const isMine = (names: string[]) =>
    !!myNameNorm && names.some((n) => n.trim().toLowerCase() === myNameNorm);

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6 pb-24">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-bg px-3 py-1 rounded-full text-xs text-ink-secondary mb-3">
          <span className="w-5 h-5 rounded-full bg-primary text-white grid place-items-center text-[10px] font-bold">
            {data.request.captain_name.charAt(0).toUpperCase()}
          </span>
          Incoming from {data.request.captain_name}
        </div>
        <div className="inline-block bg-primary-hover text-sun font-mono text-[10px] font-extrabold tracking-widest px-2 py-1 rounded">
          ⚓ MATEY ORDERS
        </div>
        <h1 className="text-2xl font-bold mt-2">
          {data.request.intent ?? data.request.prompt}
        </h1>
        <p className="text-sm text-ink-secondary mt-1 max-w-sm mx-auto">
          {data.request.captain_name}'s free windows. Tap every time that works
          for ye — tap again to remove. {data.request.captain_name} picks the
          final time.
        </p>
        {voterName.trim() && (
          <p className="text-xs text-ink-secondary mt-2">
            Voting as <strong>{voterName.trim()}</strong>
          </p>
        )}
      </div>

      {askingName && (
        <div className="card mb-4 border-primary">
          <div className="text-sm font-semibold mb-2">What's yer name, matey?</div>
          <input
            type="text"
            value={voterName}
            onChange={(e) => setVoterName(e.target.value)}
            placeholder="e.g. Tony"
            className="w-full p-3 rounded-xl border-2 border-border focus:border-primary outline-none text-sm"
            autoFocus
          />
          <input
            type="email"
            value={voterEmail}
            onChange={(e) => setVoterEmail(e.target.value)}
            placeholder="Email (optional — for the cal invite)"
            className="w-full p-3 mt-2 rounded-xl border-2 border-border focus:border-primary outline-none text-sm"
          />
          <button
            type="button"
            disabled={!voterName.trim()}
            onClick={() => {
              const opt = pendingOptionId;
              const choice = pendingChoice;
              setStatus("ready");
              submitVote(choice, opt);
            }}
            className="btn btn-primary w-full mt-3"
          >
            {pendingChoice === "rough_seas"
              ? "🌊 Send rough seas"
              : "⚓ Drop anchor"}
          </button>
        </div>
      )}

      <div
        className="rounded-2xl border-2 border-sky relative p-3"
        style={{
          background: "linear-gradient(180deg, #F0F9FF 0%, #E0F2FE 100%)",
        }}
      >
        <div className="absolute -top-3 left-3 bg-[#0EA5E9] text-white text-[10px] font-extrabold tracking-widest px-2 py-1 rounded font-mono">
          FLEET BOARD
        </div>

        {data.options.map((o, i) => {
          const coord = `${String.fromCharCode(65 + i)}${i + 1}`;
          const mine = isMine(o.aye_voter_names);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => submitVote("aye", o.id)}
              disabled={status === "submitting"}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 mb-2 last:mb-0 transition-all ${
                mine
                  ? "border-danger bg-red-50"
                  : "border-sky bg-white hover:border-danger hover:-translate-y-0.5 hover:shadow-lift"
              }`}
            >
              <div className="w-11 h-11 rounded-lg bg-[#0EA5E9] text-white grid place-items-center font-extrabold font-mono">
                {coord}
              </div>
              <div className="flex-1 text-left">
                <div className="font-semibold text-sm">{o.label}</div>
                <div className="text-xs text-ink-secondary">
                  {new Date(o.starts_at).toLocaleString()}
                </div>
                {o.aye_count > 0 && (
                  <div className="text-[11px] text-ink-secondary mt-1">
                    {o.aye_count} aye{o.aye_count === 1 ? "" : "s"}
                    {o.aye_voter_names.length > 0 && (
                      <> · {o.aye_voter_names.join(", ")}</>
                    )}
                  </div>
                )}
              </div>
              <span
                className={`font-mono text-[10px] font-extrabold tracking-widest px-2 py-1 rounded ${
                  mine ? "bg-ink text-white" : "bg-danger text-white"
                }`}
              >
                {mine ? "AYE'D ✓" : "AYE AYE"}
              </span>
            </button>
          );
        })}
      </div>

      {error && <div className="mt-3 text-sm text-danger">{error}</div>}

      <button
        type="button"
        onClick={() => submitVote("rough_seas", null)}
        disabled={status === "submitting"}
        className="btn w-full mt-4 text-ink-secondary"
      >
        🌊 Rough seas — none of these work
      </button>

      <p className="text-center text-[11px] text-ink-secondary mt-6">
        Powered by <span className="text-primary font-bold">SyncMeCal</span> ·
        Sink the meeting, save the day.
      </p>
    </main>
  );
}
