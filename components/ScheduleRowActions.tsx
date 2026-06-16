"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Per-row controls on the /schedules list: open the original request, pause /
 * resume the recurrence, or stop it.
 */
export function ScheduleRowActions({
  scheduleId,
  enabled,
  originRequestId,
}: {
  scheduleId: string;
  enabled: boolean;
  originRequestId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleEnabled() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/schedules/${scheduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Update failed");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (
      !confirm(
        "Stop this recurring voyage? Past requests stay; no new ones will be created.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Stop failed");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        {originRequestId && (
          <Link
            href={`/requests/${originRequestId}`}
            className="btn btn-secondary text-xs px-3 py-1"
          >
            Open
          </Link>
        )}
        <button
          type="button"
          onClick={toggleEnabled}
          disabled={busy}
          className="btn btn-secondary text-xs px-3 py-1"
        >
          {enabled ? "Pause" : "Resume"}
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={busy}
          className="btn text-xs px-3 py-1 text-danger"
        >
          Stop
        </button>
      </div>
      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  );
}
