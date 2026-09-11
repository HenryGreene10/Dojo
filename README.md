# Mahjong Dojo

A deliberately simple Mah Jong signup app: a host creates a game, texts one link to the group, and guests take a seat without creating a visible account.

## Product model

- **Dojo**: the recurring friend group.
- **Game**: one date/time/location inside a dojo.
- **Table**: four explicit seats inside a game.
- **Host**: authenticated by email magic link. A dojo can have multiple hosts.
- **Guest**: opens a capability link and joins with only a name. Supabase Anonymous Auth creates an invisible session behind the scenes so the guest can later cancel from the same browser.

## Stack

- Next.js 16 / React / TypeScript
- Tailwind CSS 4 plus a small custom design system in `globals.css`
- Motion for the entrance and seat animations
- Supabase Postgres + Auth + Realtime Broadcast
- Vercel-compatible deployment
- Playwright mobile + desktop end-to-end tests

## Why the backend is structured this way

The underlying tables are not directly readable by `anon` or `authenticated` Data API roles. The app uses narrow Postgres RPC functions instead. This keeps invite-only game details from becoming enumerable while still allowing a guest link to act as the capability to view a game.

Seat assignment happens inside a database transaction that locks the game row. Two guests hitting “Take a seat” at the same moment cannot receive the same final chair. A unique partial index on active `seat_id` is a second line of defense.

Realtime uses a public channel named from the high-entropy invite code, but its payload contains only a “game changed” signal. Clients then refetch the authoritative state through `get_public_game`. Someone who somehow guesses a channel can at worst cause extra refetches; they cannot mutate the database.

## Local setup

1. Create a Supabase project.
2. In **Authentication → Providers**, enable **Anonymous Sign-Ins** and email magic-link sign in.
3. Keep public Realtime channels enabled (this is the default on Supabase at the time this project was built).
4. Run `supabase/migrations/0001_initial.sql` in the SQL editor or through the Supabase CLI.
5. Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

6. Install and run:

```bash
npm install
npm run dev
```

The zero-backend visual/demo flow always lives at:

```text
http://localhost:3000/g/demo
```

## Production deployment

1. Push this repository to GitHub.
2. Import the repository in Vercel.
3. Add the three environment variables above, changing `NEXT_PUBLIC_SITE_URL` to the production domain.
4. Add the production callback URL to Supabase Auth redirect URLs:

```text
https://YOUR_DOMAIN/auth/callback
```

5. Deploy.

No Supabase service-role/secret key is used by the web application.

## Host flow

1. `/host` → email magic link.
2. Create a dojo once for the recurring group.
3. “Invite a host” copies a one-use link. The recipient signs in and joins that same dojo as another host.
4. Create a game with date, time, location, and number of tables.
5. Copy `/g/<invite-code>` into iMessage/WhatsApp.
6. Manage tables and players from `/host/g/<game-id>`.

## Guest flow

1. Open the group-chat link.
2. Dojo doors open (skipped automatically for reduced-motion users).
3. See date, time, location, current tables, and open seats.
4. Tap **Enter the dojo**.
5. Type a name.
6. Receive the next open seat, or enter the waitlist if all tables are full.
7. If a seated guest cancels, the oldest waitlisted guest is automatically promoted.

## Testing

```bash
npm run typecheck
npm run build
npx playwright install
npm run test:e2e
```

The Playwright suite runs both desktop Chromium and an iPhone-sized browser profile against the demo route, so basic joining/cancellation is testable without a Supabase project.

## Intentional V1 omissions

No chat, payments, game scoring, guest passwords, social feed, push notifications, or App Store wrapper. The group chat is the communication layer; Mahjong Dojo is the signup and seating layer.
