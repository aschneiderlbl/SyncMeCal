import { NextResponse, type NextRequest } from "next/server";

/**
 * GET /auth/start
 *
 * Builds the Google OAuth URL ourselves and redirects there directly. We
 * bypass Supabase's `signInWithOAuth` wrapper because it was not reliably
 * forwarding our calendar scope to Google.
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${appUrl}/auth/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/calendar.freebusy",
    ].join(" "),
  );
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");

  return NextResponse.redirect(url.toString());
}
