import Link from "next/link";
import { CapnCal } from "@/components/CapnCal";

type SearchParams = { error?: string | string[] };

export default function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const errorRaw = searchParams.error;
  const error = Array.isArray(errorRaw) ? errorRaw[0] : errorRaw;
  const needsCalendar = error === "calendar_scope_required";
  const otherError = !!error && !needsCalendar;

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card max-w-sm w-full text-center" style={{ padding: 32 }}>
        <div className="flex justify-center">
          <CapnCal size={140} />
        </div>

        {needsCalendar ? (
          <>
            <div
              className="text-xs font-bold uppercase tracking-wider mt-4"
              style={{ color: "#B45309" }}
            >
              Almost there
            </div>
            <h1 className="text-2xl font-bold mt-2">One more check, captain.</h1>
            <p className="text-ink-secondary text-sm mt-3">
              Cap&apos;n Cal needs to see when you&apos;re free. On Google&apos;s next screen,
              make sure to <strong>check the box</strong> next to{" "}
              <em>&ldquo;View your availability in your calendars&rdquo;</em>{" "}
              before clicking Continue.
            </p>

            <div className="rounded-xl border p-3 text-left text-xs mt-4 mb-4"
              style={{ background: "#FEF3C7", borderColor: "#FDE68A", color: "#92400E" }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 14 }}>☑</span>
                <span>View your availability in your calendars</span>
              </div>
              <div className="mt-1 text-[11px] opacity-80">
                Without this, Cap&apos;n Cal can&apos;t chart a course.
              </div>
            </div>

            <Link href="/auth/start" className="btn btn-primary w-full">
              <GoogleG /> Try again
            </Link>
          </>
        ) : (
          <>
            <div className="text-xs font-bold text-primary uppercase tracking-wider mt-4">
              Ahoy, captain
            </div>
            <h1 className="text-2xl font-bold mt-2">SyncMeCal</h1>
            <p className="text-ink-secondary text-sm mt-2 mb-6">
              Tell Cap&apos;n Cal what you want to schedule. He&apos;ll chart open
              windows and send mateys a link to drop anchor.
            </p>

            {otherError && (
              <div
                className="rounded-xl border p-3 text-xs mb-4 text-left"
                style={{ background: "#FEF2F2", borderColor: "#FECACA", color: "#991B1B" }}
              >
                Something went sideways: {error}
              </div>
            )}

            <Link href="/auth/start" className="btn btn-primary w-full">
              <GoogleG /> Continue with Google
            </Link>

            <div className="text-xs text-ink-secondary mt-4 leading-relaxed">
              <p>We use OAuth. Cap&apos;n Cal sees your free/busy, not your event details.</p>
              <p className="mt-2" style={{ color: "#B45309" }}>
                💡 On Google&apos;s screen, <strong>check the calendar checkbox</strong> before clicking Continue.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.8 32.4 29.4 35.5 24 35.5c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8c1.8-4.4 6-7.5 10.9-7.5 3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 16.3 3 9.7 7.4 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.4-5.3l-6.2-5.2c-2 1.4-4.5 2.3-7.2 2.3-5.4 0-9.9-3.6-11.5-8.6l-6.6 5.1C9.3 40.4 16 45 24 45z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.2-4.1 5.5l6.2 5.2C41.4 35.2 45 30 45 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
