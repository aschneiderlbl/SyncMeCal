import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer, createSupabaseService } from "@/lib/supabase/server";

/**
 * OAuth callback. Google has bounced the user back here with `?code=...`.
 *
 * We exchange the code for Google tokens directly (not via Supabase), then
 * use the resulting id_token to mint a Supabase session via signInWithIdToken.
 * Finally we persist the Google access + refresh tokens to the user's
 * profile so we can call FreeBusy later.
 *
 * This deliberately bypasses Supabase's OAuth wrapper because that wrapper
 * was not reliably forwarding our calendar scope to Google.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const next = searchParams.get("next") ?? "/";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin;

  if (errorParam) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorParam)}`,
    );
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // ---- 1. Exchange code → Google tokens
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${appUrl}/auth/callback`,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!tokenResp.ok) {
    const text = await tokenResp.text();
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("google_token_exchange: " + text.slice(0, 300))}`,
    );
  }

  const tokens = (await tokenResp.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };

  // If the calendar.freebusy scope wasn't granted (user didn't check the box on
  // Google's consent screen), bounce them back to /login with a friendly code
  // so the login page can show a guided "check the box this time" flow.
  if (!tokens.scope?.includes("calendar.freebusy")) {
    console.log(
      "[oauth callback] calendar.freebusy not granted. Got:",
      tokens.scope ?? "(none)",
    );
    return NextResponse.redirect(`${origin}/login?error=calendar_scope_required`);
  }

  // ---- 2. Sign in to Supabase using the Google id_token
  const supabase = createSupabaseServer();
  const { data: session, error: sessionErr } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: tokens.id_token,
  });

  if (sessionErr || !session.user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("supabase_signin: " + (sessionErr?.message ?? "no_user"))}`,
    );
  }

  // ---- 3. Persist the Google tokens + profile (service-role bypasses RLS)
  const user = session.user;
  const svc = createSupabaseService();
  await svc.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? "",
      display_name:
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        user.email ??
        "",
      avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      google_access_token: tokens.access_token,
      google_refresh_token: tokens.refresh_token ?? null,
      google_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    },
    { onConflict: "id" },
  );

  return NextResponse.redirect(`${origin}${next}`);
}
