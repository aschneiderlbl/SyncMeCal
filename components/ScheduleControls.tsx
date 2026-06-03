"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Cadence } from "@/lib/types";

type ExistingSchedule = {
  id: string;
  cadence: Cadence;
  next_run_at: string;
  enabled: boolean;
} | null;

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

/**
 * Client-side controls for the request detail page: if no schedule is linked,
 * show a "Make recurring" picker; if one is linked, show status + stop button.
 */
export function ScheduleControls({
  requestId,
  schedule,
}: {
  requestId: string;
  schedule: ExistingSchedule;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<Cadence | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createSchedule(cadence: Cadence) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, cadence }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to create schedule");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function stopSchedule(id: string) {
    if (!confirm("Stop this recurring run? Past requests stay; no new ones will be created.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to stop schedule");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (schedule) {
    const next = new Date(schedule.next_run_at).toLocaleString();
    return (
      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-primary uppercase tracking-wider mb-1">
              Recurring · {schedule.cadence}
            </div>
            <div className="text-sm text-ink-secondary">
              Next run: {next}
              {!schedule.enabled && " (paused)"}
            </div>
          </div>
          <button
            onClick={() => stopSchedule(schedule.id)}
            disabled={busy}
            className="btn btn-secondary"
          >
            Stop
          </button>
        </div>
        {error && <div className="mt-2 text-sm text-danger">{error}</div>}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="text-xs font-bold text-primary uppercase tracking-wider mb-1">
        Make this recurring
      </div>
      <p className="text-sm text-ink-secondary">
        Re-run this prompt and email you fresh times on a cadence.
      </p>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {CADENCE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPicker(opt.value)}
            disabled={busy}
            className={`card text-sm font-medium text-center ${
              picker === opt.value ? "!border-primary !bg-cta-light" : ""
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => picker && createSchedule(picker)}
        disabled={busy || !picker}
        className="btn btn-primary w-full mt-3"
      >
        {busy ? "Saving…" : "Set up recurrence"}
      </button>
      {error && <div className="mt-2 text-sm text-danger">{error}</div>}
    </div>
  );
}
