"use client";

import { useState } from "react";

export function CopyButtonClient({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // best-effort
        }
      }}
      className={`text-xs font-semibold px-3 py-2 rounded-lg ${
        copied ? "bg-cta text-white" : "bg-primary text-white"
      }`}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}
