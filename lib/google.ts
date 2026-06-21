import { google } from "googleapis";
import { createSupabaseService } from "@/lib/supabase/server";

/**
 * Build a Google OAuth2 client for a given Supabase user. Loads the user's
 * stored Google tokens from the profiles table.
 *
 * If the access token is expired, the googleapis client will refresh it
 * using the refresh_token automatically — and we persist the new tokens back.
 */
export async function googleClientForUser(userId: string) {
  const svc = createSupabaseService();
  const { data: profile, error } = await svc
    .from("profiles")
    .select("google_access_token, google_refresh_token, google_token_expires_at")
    .eq("id", userId)
    .single();

  if (error || !profile?.google_refresh_token) {
    throw new Error("Google not connected for this user");
  }

  // We pass client_id/client_secret so the OAuth2 client can refresh the
  // access token by hitting Google's token endpoint when it expires.
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    access_token: profile.google_access_token ?? undefined,
    refresh_token: profile.google_refresh_token,
    expiry_date: profile.google_token_expires_at
      ? new Date(profile.google_token_expires_at).getTime()
      : undefined,
  });

  type RefreshedTokens = {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  };
  // Persist refreshed tokens back to the DB.
  oauth2.on("tokens", async (tokens: RefreshedTokens) => {
    await svc
      .from("profiles")
      .update({
        google_access_token: tokens.access_token ?? profile.google_access_token,
        google_refresh_token: tokens.refresh_token ?? profile.google_refresh_token,
        google_token_expires_at: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
      })
      .eq("id", userId);
  });

  return oauth2;
}

export type FreeBusyWindow = { start: string; end: string };

// Google's freebusy endpoint accepts at most 50 calendar items per request.
const FREEBUSY_BATCH_SIZE = 50;

// Google's freebusy endpoint also caps a single query at roughly 90 days
// (timeMax - timeMin). Chunk longer ranges so prompts like "in the fall"
// (which can span >3 months) still work.
const FREEBUSY_MAX_DAYS_PER_QUERY = 60;
const MS_PER_DAY = 86_400_000;

/**
 * Enumerate the user's calendars and return the IDs we want to factor into
 * availability. We include everything in their calendar list EXCEPT calendars
 * they've explicitly hidden in Google Calendar — hiding is the user's signal
 * that a calendar shouldn't affect their schedule.
 *
 * Requires the `calendar.calendarlist.readonly` scope.
 */
async function listUserCalendarIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auth: any,
): Promise<string[]> {
  const calendar = google.calendar({ version: "v3", auth });
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const resp = await calendar.calendarList.list({
      maxResults: 250,
      showHidden: false,
      pageToken,
    });
    for (const item of resp.data.items ?? []) {
      if (!item.id) continue;
      if (item.hidden) continue;
      ids.push(item.id);
    }
    pageToken = resp.data.nextPageToken ?? undefined;
  } while (pageToken);

  // Safety net: if for some reason calendarList came back empty, fall back to
  // primary so we still return *something* useful.
  if (ids.length === 0) ids.push("primary");
  return ids;
}

/**
 * Call Google Calendar FreeBusy for `userId` over [timeMin, timeMax].
 *
 * Returns busy windows merged across ALL of the user's calendars (primary,
 * imported work calendar, shared calendars, etc.) — any calendar that's not
 * hidden in Google Calendar's UI contributes to the busy set. A slot is
 * unavailable if *any* calendar reports it as busy.
 */
export async function getFreeBusy(
  userId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<FreeBusyWindow[]> {
  const auth = await googleClientForUser(userId);
  const calendar = google.calendar({ version: "v3", auth });

  const calendarIds = await listUserCalendarIds(auth);

  type RawBusy = { start?: string | null; end?: string | null };
  const merged: FreeBusyWindow[] = [];

  // Split the requested range into ≤60-day windows so we stay well under
  // Google's FreeBusy per-query cap (~3 months). Each window is queried
  // independently across all calendar batches.
  const windows: { from: Date; to: Date }[] = [];
  for (
    let t = timeMin.getTime();
    t < timeMax.getTime();
    t += FREEBUSY_MAX_DAYS_PER_QUERY * MS_PER_DAY
  ) {
    const from = new Date(t);
    const to = new Date(
      Math.min(t + FREEBUSY_MAX_DAYS_PER_QUERY * MS_PER_DAY, timeMax.getTime()),
    );
    windows.push({ from, to });
  }

  for (const win of windows) {
    // FreeBusy accepts up to 50 calendars per request — batch if needed.
    for (let i = 0; i < calendarIds.length; i += FREEBUSY_BATCH_SIZE) {
      const batch = calendarIds.slice(i, i + FREEBUSY_BATCH_SIZE);
      const resp = await calendar.freebusy.query({
        requestBody: {
          timeMin: win.from.toISOString(),
          timeMax: win.to.toISOString(),
          items: batch.map((id) => ({ id })),
        },
      });

      const calendars = resp.data.calendars ?? {};
      for (const id of batch) {
        const entry = calendars[id];
        if (!entry) continue;
        // Per-calendar errors (e.g. notFound) are surfaced here — skip silently
        // so one bad calendar doesn't blow up the whole availability check.
        if (entry.errors && entry.errors.length > 0) continue;
        const busy: RawBusy[] = entry.busy ?? [];
        for (const b of busy) {
          if (b.start && b.end) merged.push({ start: b.start, end: b.end });
        }
      }
    }
  }

  return mergeOverlappingWindows(merged);
}

/**
 * Sort + merge overlapping/adjacent busy windows so downstream consumers see a
 * clean, deduplicated busy timeline.
 */
function mergeOverlappingWindows(windows: FreeBusyWindow[]): FreeBusyWindow[] {
  if (windows.length === 0) return [];
  const sorted = [...windows].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  const out: FreeBusyWindow[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const curr = sorted[i];
    if (new Date(curr.start).getTime() <= new Date(prev.end).getTime()) {
      // Overlapping or touching — extend prev.end to the later of the two.
      if (new Date(curr.end).getTime() > new Date(prev.end).getTime()) {
        prev.end = curr.end;
      }
    } else {
      out.push(curr);
    }
  }
  return out;
}
