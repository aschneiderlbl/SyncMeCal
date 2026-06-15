"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Captain-side button to manually anchor (or unanchor) a specific option on
 * a request. Lives on the detail page; calls /api/requests/[id]/anchor.
 */
export function AnchorButton({
  requestId,
  optionId,
  variant,
}: {
  requestId: string;
  optionId: string;
  variant: "anchor" | "unanchor";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/requests/${requestId}/anchor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          option_id: variant === "anchor" ? optionId : null,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Anchor failed");
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
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={
          variant === "anchor"
            ? "btn btn-primary text-xs px-3 py-1"
            : "btn btn-secondary text-xs px-3 py-1"
        }
      >
        {busy
          ? "…"
          : variant === "anchor"
            ? "⚓ Anchor this"
            : "Unanchor"}
      </button>
      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  );
}
