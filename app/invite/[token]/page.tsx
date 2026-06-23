"use client";

import { useCallback, useEffect, useState } from "react";
import type { InvitePublicPayload } from "@/lib/types";

type Status =
  | "loading"
  | "ready"
  | "name_prompt"
  | "submitting"
  | "anchored"
  | "done"
  | "rough_seas"
  | "error";

const NAME_STORAGE_KEY = "syncmecal:matey_name";
const EMAIL_STORAGE_KEY = "syncmecal:matey_email";

export default function InvitePage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<InvitePublicPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");
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

      // Trust the POST's returned voter list — no second GET (CDN cache risk).
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

  // Matey hit "Done" after picking their slots.
  if (status === "done") {
    const myAyes = data.options.filter((o) =>
      o.aye_voter_names.some(
        (n) => n.trim().toLowerCase() === voterName.trim().toLowerCase(),
      ),
    );
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
            {data.request.captain_name} will pick the final time from the
            options you marked.
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

  const askingName = status === "name_prompt";
  const myNameNorm = voterName.trim().toLowerCase();
  const isMine = (names: string[]) =>
    !!myNameNorm && names.some((n) => n.trim().toLowerCase() === myNameNorm);
  const myPickCount = data.options.filter((o) => isMine(o.aye_voter_names))
    .length;

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6 pb-32">
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

      {/* Prominent how-it-works card */}
      <div className="card mb-4 border-primary" style={{ background: "#EFF6FF" }}>
        <div className="text-xs font-bold text-primary uppercase tracking-wider mb-1">
          ✅ Check every time that works
        </div>
        <p className="text-sm">
          <strong>Pick as many as you can</strong> — the more options you mark,
          the easier it is for {data.request.captain_name} to find a time that
          works for everyone. They'll pick the final time.
        </p>
        {voterName.trim() && (
          <div className="text-xs text-ink-secondary mt-2">
            Voting as <strong>{voterName.trim()}</strong>
            {myPickCount > 0 && <> · {myPickCount} picked so far</>}
          </div>
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
              : "Save my pick"}
          </button>
        </div>
      )}

      {/* Option list with big visible checkboxes */}
      <div className="space-y-2">
        {data.options.map((o) => {
          const mine = isMine(o.aye_voter_names);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => submitVote("aye", o.id)}
              disabled={status === "submitting"}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                mine
                  ? "border-cta bg-cta-light shadow-lift"
                  : "border-border bg-white hover:border-primary hover:-translate-y-0.5"
              }`}
            >
              {/* Big visual checkbox on the LEFT */}
              <div
                className={`w-9 h-9 rounded-lg grid place-items-center border-2 flex-shrink-0 transition-all ${
                  mine
                    ? "bg-cta border-cta text-white"
                    : "bg-white border-border text-transparent"
                }`}
              >
                <span className="text-xl font-extrabold leading-none">✓</span>
              </div>

              <div className="flex-1 text-left min-w-0">
                <div
                  className={`font-semibold text-base ${mine ? "text-ink" : ""}`}
                >
                  {o.label}
                </div>
                <div className="text-xs text-ink-secondary mt-0.5">
                  {new Date(o.starts_at).toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
                {o.aye_count > 0 && (
                  <div className="text-[11px] text-ink-secondary mt-1">
                    {o.aye_count} {o.aye_count === 1 ? "matey" : "mateys"}:{" "}
                    {o.aye_voter_names.join(", ")}
                  </div>
                )}
              </div>

              {mine && (
                <span className="font-mono text-[10px] font-extrabold tracking-widest bg-cta text-white px-2 py-1 rounded flex-shrink-0">
                  PICKED
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && <div className="mt-3 text-sm text-danger">{error}</div>}

      {/* Sticky bottom action bar — only shown when we have a name */}
      {voterName.trim() && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border p-4 shadow-lg">
          <div className="max-w-2xl mx-auto flex gap-2">
            <button
              type="button"
              onClick={() => submitVote("rough_seas", null)}
              disabled={status === "submitting"}
              className="btn btn-secondary flex-1 text-sm"
            >
              🌊 None work
            </button>
            <button
              type="button"
              onClick={() => setStatus("done")}
              disabled={status === "submitting" || myPickCount === 0}
              className="btn btn-primary flex-[2] text-sm"
            >
              {myPickCount === 0
                ? "Pick at least one"
                : `✅ Done · ${myPickCount} picked`}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
