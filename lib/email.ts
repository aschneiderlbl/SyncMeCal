import type { Cadence } from "@/lib/types";

type OptionLite = {
  label: string | null;
  starts_at: string;
};

/**
 * Send a "your recurring run found these times" email via Resend.
 *
 * If RESEND_API_KEY is not configured, the email is logged and skipped — the
 * surrounding flow (cron, schedule creation) keeps working in dev without
 * an inbox set up.
 */
export async function sendProposalEmail(args: {
  to: string;
  toName?: string | null;
  intent: string;
  options: OptionLite[];
  shareUrl: string;
  cadence: Cadence;
  userTz?: string;
}): Promise<{ ok: true } | { skipped: true; reason: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM_EMAIL ?? "Cap'n Cal <onboarding@resend.dev>";
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping send to", args.to);
    return { skipped: true, reason: "no_api_key" };
  }

  const { to, intent, options, shareUrl, cadence } = args;
  const tz = args.userTz ?? "UTC";

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const lineFor = (o: OptionLite) => o.label ?? fmt(o.starts_at);

  const heading = `Your ${cadence} "${intent}" run`;
  const intro =
    options.length === 0
      ? "Cap'n Cal found no clear windows in this cycle. Adjust the prompt or check your calendars."
      : `Cap'n Cal found ${options.length} clear ${
          options.length === 1 ? "window" : "windows"
        }:`;

  const textLines = [
    heading,
    "",
    intro,
    ...(options.length > 0 ? ["", ...options.map((o) => `• ${lineFor(o)}`)] : []),
    "",
    `Vote / share: ${shareUrl}`,
  ];
  const text = textLines.join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;color:#1F2937;line-height:1.5;max-width:560px;margin:0 auto;padding:16px;">
      <h2 style="margin:0 0 12px;font-size:18px;">${escapeHtml(heading)}</h2>
      <p style="margin:0 0 12px;">${escapeHtml(intro)}</p>
      ${
        options.length > 0
          ? `<ul style="padding-left:20px;margin:0 0 16px;">${options
              .map(
                (o) =>
                  `<li style="margin:4px 0;">${escapeHtml(lineFor(o))}</li>`,
              )
              .join("")}</ul>`
          : ""
      }
      <p style="margin:16px 0 0;">
        <a href="${escapeAttr(shareUrl)}" style="color:#2563EB;text-decoration:none;font-weight:600;">
          Open share link →
        </a>
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#6B7280;">
        You're getting this because you set up a ${cadence} recurrence in SyncMeCal.
      </p>
    </div>
  `;

  const subject = `${intent} — ${options.length} ${
    options.length === 1 ? "time" : "times"
  } proposed`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`resend_failed: ${resp.status} ${body.slice(0, 200)}`);
  }
  return { ok: true };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
    }
    return c;
  });
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
