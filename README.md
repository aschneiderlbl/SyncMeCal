# SyncMeCal

A scheduling app for dads in their late 30s. Type what you want to schedule in plain English; Cap'n Cal parses it, checks your Google Calendar free/busy, proposes 3 times, and your mateys vote *Aye Aye* or *Rough Seas* on a public share link.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Supabase** — Postgres + Auth + Row-level security
- **Google Calendar API** — FreeBusy
- **Anthropic Claude** — prompt parsing (Haiku for speed/cost)
- **Tailwind** — styling
- **Vercel** — hosting

## One-time setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, paste and run `supabase/migrations/0001_init.sql`.
3. Project Settings → API: copy the **Project URL**, **anon public** key, and **service_role** key.

### 2. Google Cloud (for Google login + FreeBusy)

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a project.
2. APIs & Services → Library: enable **Google Calendar API**.
3. APIs & Services → OAuth consent screen: set up an **External** app. Add scopes:
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/calendar.freebusy`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
4. APIs & Services → Credentials → Create OAuth client ID → **Web application**.
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `https://<your-supabase-project>.supabase.co/auth/v1/callback`
5. Copy the **Client ID** and **Client secret**. You'll paste these into Supabase AND your `.env.local` — both sides need them. Supabase uses them for the initial OAuth handshake; the app uses them to refresh access tokens server-side when calling FreeBusy.
6. Back in Supabase → Authentication → Providers → **Google**: enable, paste Client ID + Secret. In the "Additional Scopes" field add: `https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.calendarlist.readonly`.

### 3. Anthropic

1. Get an API key from [console.anthropic.com](https://console.anthropic.com).

### 4. Local env

```bash
cp .env.local.example .env.local
# fill in the values from steps 1–3
```

### 5. Install + run

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Project layout

```
app/
  page.tsx                       — home dashboard (signed-in)
  login/page.tsx                 — Google login
  auth/callback/route.ts         — OAuth callback (saves Google tokens)
  auth/signout/route.ts          — sign out
  compose/page.tsx               — chart a course (new request)
  requests/[id]/page.tsx         — request detail + share link
  invite/[token]/page.tsx        — PUBLIC invite page (mateys land here)
  api/
    parse-prompt/route.ts        — POST: prompt → structured rules (Claude)
    generate-options/route.ts    — POST: rules + FreeBusy → 3 candidate slots
    invite/[token]/route.ts      — GET: public invite payload
    invite/[token]/vote/route.ts — POST: matey votes Aye Aye / Rough Seas

lib/
  supabase/{client,server,middleware}.ts  — @supabase/ssr clients
  anthropic.ts                   — Claude SDK
  google.ts                      — Calendar FreeBusy
  parsePrompt.ts                 — Claude → structured rules
  generateOptions.ts             — pick 3 slots from free windows
  types.ts                       — shared types

supabase/migrations/0001_init.sql — schema + RLS
```

## Pirate vocabulary

| In code        | In UI               |
| -------------- | ------------------- |
| create_request | Chart a course      |
| accept_time    | Aye aye             |
| decline_time   | Rough seas          |
| invitees       | Mateys              |
| status=anchor  | Anchor dropped      |

## Deployment

```bash
# Once you're happy locally:
vercel  # follow prompts
# Set the same env vars in the Vercel project settings.
# Add your Vercel domain to Google OAuth authorized redirect URIs.
```

## What's not built yet

- Sending the actual Google Calendar invite once a slot is anchored
- Email notifications to the creator when mateys vote
- Reschedule / cancel
- Multiple mateys (currently first matey to vote anchors the slot — see `app/api/invite/[token]/vote/route.ts` TODOs)
- Auth-protected request listing across devices
