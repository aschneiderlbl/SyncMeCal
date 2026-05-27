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

/**
 * Call Google Calendar FreeBusy for `userId` over [timeMin, timeMax].
 * Returns the busy windows on their primary calendar.
 */
export async function getFreeBusy(
  userId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<FreeBusyWindow[]> {
  const auth = await googleClientForUser(userId);
  const calendar = google.calendar({ version: "v3", auth });

  const resp = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: "primary" }],
    },
  });

  type RawBusy = { start?: string | null; end?: string | null };
  const busy: RawBusy[] = resp.data.calendars?.primary?.busy ?? [];
  return busy
    .filter((b: RawBusy): b is { start: string; end: string } => !!b.start && !!b.end)
    .map((b: { start: string; end: string }) => ({ start: b.start, end: b.end }));
}
