"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Cadence, GeneratedOption, ParsedPrompt } from "@/lib/types";

type CadenceChoice = "none" | Cadence;

const CADENCE_OPTIONS: { value: CadenceChoice; label: string }[] = [
  { value: "none", label: "One-off" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

const EXAMPLES = [
  { emoji: "☕", text: "Find coffee with Tony this summer" },
  { emoji: "⛳", text: "Find a golf outing in June" },
  { emoji: "💼", text: "Find 90 minutes for a board meeting next week" },
];

type Step = "edit" | "thinking" | "review";

export default function ComposePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [step, setStep] = useState<Step>("edit");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedPrompt | null>(null);
  const [options, setOptions] = useState<GeneratedOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [cadence, setCadence] = useState<CadenceChoice>("none");

  async function chartCourse() {
    if (!prompt.trim()) return;
    setError(null);
    setStep("thinking");
    try {
      // Send the user's IANA timezone so the server constructs slot times in
      // the right wall-clock instead of UTC (Vercel runs in UTC).
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const r = await fetch("/api/generate-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, tz }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Failed to chart course");
      setParsed(json.parsed);
      setOptions(json.options);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("edit");
    }
  }

  async function saveRequest() {
    if (!parsed || options.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, parsed, options }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Failed to save");

      // If the user chose a cadence, also create a recurring schedule.
      if (cadence !== "none") {
        const sr = await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: json.id, cadence }),
        });
        if (!sr.ok) {
          const sj = await sr.json().catch(() => ({}));
          throw new Error(sj.error ?? "Failed to create schedule");
        }
      }

      router.push(`/requests/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6 pb-24">
      <header className="flex items-center justify-between mb-6">
        <Link href="/" className="text-sm text-ink-secondary hover:text-primary">← Home</Link>
        <h1 className="font-bold">⚓ Chart a course</h1>
        <div className="w-10" />
      </header>

      {step === "edit" && (
        <>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. find three Friday mornings this summer for coffee with Tony"
            className="w-full p-4 rounded-xl border-2 border-border focus:border-primary outline-none text-base resize-none"
            rows={4}
          />

          <div className="mt-4">
            <div className="text-xs font-semibold text-ink-secondary mb-2">Or tap one to try</div>
            <div className="space-y-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.text}
                  onClick={() => setPrompt(ex.text)}
                  className="card w-full flex items-center gap-3 text-left hover:border-primary"
                >
                  <span className="w-9 h-9 rounded-lg bg-bg grid place-items-center text-xl">{ex.emoji}</span>
                  <span className="text-sm font-medium">{ex.text}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <div className="mt-4 text-sm text-danger">{error}</div>}

          <button onClick={chartCourse} disabled={!prompt.trim()} className="btn btn-primary w-full mt-6">
            ⚓ Chart a course
          </button>
        </>
      )}

      {step === "thinking" && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3 animate-bob">🧭</div>
          <div className="font-semibold">Cap'n Cal is charting the waters…</div>
          <div className="text-sm text-ink-secondary mt-1">
            Parsing your prompt and reading your free/busy.
          </div>
        </div>
      )}

      {step === "review" && parsed && (
        <>
          <div className="card" style={{ background: "#F5F7FA", borderStyle: "dashed" }}>
            <div className="text-xs font-semibold text-ink-secondary">You said</div>
            <div className="text-base font-medium mt-1">{prompt}</div>
          </div>

          <section className="mt-6">
            <div className="text-xs font-bold uppercase tracking-wider text-primary">Cap'n Cal heard</div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="pill">{parsed.intent}</span>
              {parsed.participants.map((p) => (
                <span key={p} className="pill pill-green">@ {p}</span>
              ))}
              <span className="pill pill-amber">
                {parsed.date_range_start} → {parsed.date_range_end}
              </span>
              <span className="pill pill-grey">~{parsed.duration_minutes} min</span>
              {parsed.preferred_days.length > 0 && (
                <span className="pill pill-grey">{parsed.preferred_days.join(", ")}</span>
              )}
              {parsed.preferred_time_of_day !== "any" && (
                <span className="pill pill-grey">{parsed.preferred_time_of_day}s</span>
              )}
            </div>
          </section>

          <section className="mt-6">
            <h3 className="font-semibold mb-2">Proposed times</h3>
            <p className="text-sm text-ink-secondary">
              {options.length === 0
                ? "No windows are clear across all your calendars in that range."
                : `${options.length} ${options.length === 1 ? "window" : "windows"} when your cal's clear.`}
            </p>
            <div className="space-y-2 mt-3">
              {options.map((o, i) => (
                <div key={i} className="card flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-cta text-white grid place-items-center font-bold font-mono">
                    {String.fromCharCode(65 + i)}{i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{o.label}</div>
                    <div className="text-xs text-ink-secondary">
                      {new Date(o.starts_at).toLocaleString()} – {new Date(o.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <h3 className="font-semibold mb-2">Repeat</h3>
            <p className="text-sm text-ink-secondary">
              Re-run this prompt automatically and email you fresh times.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3 sm:grid-cols-4">
              {CADENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCadence(opt.value)}
                  className={`card text-sm font-medium text-center ${
                    cadence === opt.value
                      ? "!border-primary !bg-cta-light"
                      : ""
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          {error && <div className="mt-4 text-sm text-danger">{error}</div>}

          <button onClick={saveRequest} disabled={saving} className="btn btn-primary w-full mt-6">
            {saving ? "Stowing the cargo…" : "Save & get share link →"}
          </button>
          <button onClick={() => setStep("edit")} className="btn btn-secondary w-full mt-2">
            ← Edit prompt
          </button>
        </>
      )}
    </main>
  );
}
