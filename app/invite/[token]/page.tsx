"use client";

import { useEffect, useState } from "react";
import type { InvitePublicPayload } from "@/lib/types";

type Status = "loading" | "ready" | "name_prompt" | "submitting" | "anchored" | "rough_seas" | "error";

export default function InvitePage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<InvitePublicPayload | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [pickedOptionId, setPickedOptionId] = useState<string | null>(null);
  const [voterName, setVoterName] = useState("");
  const [voterEmail, setVoterEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [anchoredOption, setAnchoredOption] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/invite/${params.token}`);
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Failed to load");
        setData(json);
        if (json.request.status === "anchor_dropped") {
          setAnchoredOption(json.request.scheduled_option_id);
          setStatus("anchored");
        } else {
          setStatus("ready");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    })();
  }, [params.token]);

  async function submitVote(choice: "aye" | "rough_seas", optionId: string | null) {
    if (!voterName.trim()) {
      setStatus("name_prompt");
      return;
    }
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

      if (choice === "aye") {
        setAnchoredOption(optionId);
        setStatus("anchored");
      } else {
        setStatus("rough_seas");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("ready");
    }
  }

  if (status === "loading") {
    return <main className="min-h-screen grid place-items-center p-6 text-ink-secondary">Loading…</main>;
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

  // Anchor-dropped success
  if (status === "anchored") {
    const anchored = data.options.find((o) => o.id === anchoredOption);
    return (
      <main className="min-h-screen grid place-items-center p-6"
        style={{ background: "linear-gradient(180deg, #DBEAFE 0%, #93C5FD 30%, #3B82F6 65%, #1E3A8A 100%)" }}>
        <div className="text-center">
          <div className="text-6xl">🎯</div>
          <h1 className="text-3xl font-extrabold text-white mt-4 drop-shadow">You sunk me cal!</h1>
          <p className="text-white/90 mt-2 max-w-sm mx-auto">
            {anchored ? <>Anchor dropped on <strong>{anchored.label}</strong>.</> : "Anchor dropped."}{" "}
            {data.request.captain_name} will see your call.
          </p>
          <div className="card mt-6 max-w-sm mx-auto text-left">
            <div className="font-semibold text-sm">⚓ Anchor dropped</div>
            <div className="text-xs text-ink-secondary mt-1">
              The captain's been notified. Calendar invite coming soon.
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Rough seas — declined
  if (status === "rough_seas") {
    return (
      <main className="min-h-screen grid place-items-center p-6"
        style={{ background: "linear-gradient(180deg, #DBEAFE 0%, #93C5FD 35%, #3B82F6 70%, #1E40AF 100%)" }}>
        <div className="text-center">
          <div className="text-6xl">🌊</div>
          <h1 className="text-3xl font-extrabold text-white mt-4 drop-shadow">Rough seas!</h1>
          <p className="text-white/90 mt-2 max-w-sm mx-auto">
            We'll let {data.request.captain_name} know none of these times work. They'll chart a new course.
          </p>
        </div>
      </main>
    );
  }

  // Name prompt overlay
  const askingName = status === "name_prompt";

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
        <h1 className="text-2xl font-bold mt-2">{data.request.intent ?? data.request.prompt}</h1>
        <p className="text-sm text-ink-secondary mt-1 max-w-sm mx-auto">
          3 of {data.request.captain_name}'s free windows are out there. Tap a coordinate to shout <strong>"Aye aye!"</strong>
        </p>
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
              if (pickedOptionId) submitVote("aye", pickedOptionId);
              else submitVote("rough_seas", null);
            }}
            className="btn btn-primary w-full mt-3"
          >
            {pickedOptionId ? "⚓ Drop anchor" : "🌊 Send rough seas"}
          </button>
        </div>
      )}

      <div className="rounded-2xl border-2 border-sky relative p-3"
        style={{
          background: "linear-gradient(180deg, #F0F9FF 0%, #E0F2FE 100%)",
        }}>
        <div className="absolute -top-3 left-3 bg-[#0EA5E9] text-white text-[10px] font-extrabold tracking-widest px-2 py-1 rounded font-mono">
          FLEET BOARD
        </div>
        <div className="flex justify-between text-[10px] font-bold text-[#075985] uppercase mb-2 mt-1 px-1">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-danger ring-2 ring-white" /> Hit · meeting locked
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-white ring-2 ring-ink-secondary" /> Miss · empty water
          </span>
        </div>

        {data.options.map((o, i) => {
          const coord = `${String.fromCharCode(65 + i)}${i + 1}`;
          const picked = pickedOptionId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setPickedOptionId(o.id);
                if (!voterName.trim()) setStatus("name_prompt");
                else submitVote("aye", o.id);
              }}
              disabled={status === "submitting"}
              className={`w-full flex items-center gap-3 p-3 rounded-xl bg-white border-2 mb-2 last:mb-0 transition-all ${
                picked ? "border-danger bg-red-50" : "border-sky hover:border-danger hover:-translate-y-0.5 hover:shadow-lift"
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
              </div>
              <span className="font-mono text-[10px] font-extrabold tracking-widest bg-danger text-white px-2 py-1 rounded">
                AYE AYE
              </span>
              <span className="text-xl">🎯</span>
            </button>
          );
        })}
      </div>

      {error && <div className="mt-3 text-sm text-danger">{error}</div>}

      <button
        type="button"
        onClick={() => {
          setPickedOptionId(null);
          if (!voterName.trim()) setStatus("name_prompt");
          else submitVote("rough_seas", null);
        }}
        disabled={status === "submitting"}
        className="btn w-full mt-4 text-ink-secondary"
      >
        🌊 Rough seas — send me other times
      </button>

      <p className="text-center text-[11px] text-ink-secondary mt-6">
        Powered by <span className="text-primary font-bold">SyncMeCal</span> · Sink the meeting, save the day.
      </p>
    </main>
  );
}
