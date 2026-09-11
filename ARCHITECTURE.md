# Architecture notes

## Product boundary

Mahjong Dojo deliberately does not replace the group chat. The group chat is where invitations and conversation live. This app owns only the state that a group chat is bad at representing: **which game, which players, which tables, which open seats**.

The core hierarchy is:

```text
Dojo (recurring group)
  └─ Game (one date/time/location)
      └─ Table (four seats)
          └─ RSVP
```

A user may host multiple games; a dojo may have multiple hosts; a game may have any reasonable number of four-seat tables.

## Read/write boundary

Browser clients receive only the Supabase publishable key. The project never ships a secret/service-role key.

All application tables have RLS enabled and their direct Data API privileges are revoked from `anon` and `authenticated`. The supported interface is a small group of `SECURITY DEFINER` Postgres functions. Public game reads require possession of the high-entropy invite code; host functions additionally check `auth.uid()` against dojo membership.

This makes the invite link a capability without making all games queryable from the public API.

## Guest identity

A guest sees no signup/login UI. On the first RSVP, the browser silently creates a Supabase Anonymous Auth session. That gives the RSVP a durable user ID on that browser so the guest can cancel later and Realtime/Auth can evolve without redesigning guest identity.

Tradeoff: a guest switching devices is not automatically recognized. The host can still move/remove that RSVP. Cross-device guest identity would require adding friction (email/phone/profile) and is intentionally deferred.

## Atomic seating

`join_game` locks the game row before it looks for an empty seat. That serializes only the tiny critical section for one game and guarantees two concurrent joins cannot both observe the same last chair as available.

A partial unique index on active `seat_id` is a second line of defense. This design is intentionally simpler than distributed seat locking and is more than sufficient for the expected workload.

## Waitlist

When no seat exists, an RSVP becomes `waitlisted`. If a seated RSVP cancels, the oldest waitlisted RSVP is promoted inside the same database transaction. Adding a table similarly creates four seats and promotes the waitlist in order.

## Realtime

Database changes emit a tiny public Broadcast message to a topic derived from the high-entropy invite code. The message contains only `{ changed: true }`; it does not contain names, addresses, or table state. Clients respond by refetching the authoritative snapshot from `get_public_game`.

That has two useful properties:

1. A spoofed broadcast cannot mutate state; at worst it causes a refetch.
2. The database remains the single source of truth, so dropped/reordered WebSocket messages do not corrupt the UI.

If the product grows enough that public channels are no longer an acceptable capability boundary, anonymous guest identities allow migration to private Realtime authorization without changing the visible guest flow.

## Scaling

The hot path is small: one indexed invite lookup, a short row lock during RSVP changes, indexed seat/RSVP reads, and one Broadcast event. The expected group size is tiny compared with the capacity of Postgres/Supabase.

If this grows dramatically, the first scaling work should be measurement and targeted tuning—not a rewrite. Likely steps would be connection/computation upgrades, query profiling, caching non-sensitive invitation metadata, and private-channel tuning. The data model does not need to change to do those things.

## Privacy

Home addresses are intentionally omitted from OpenGraph/social preview metadata. Someone must open the capability URL to see the game location. Search engines should not receive a browsable index of games because there is no public listing endpoint.

## Accessibility / older users

The guest path has large tap targets, large default text, one primary action at a time, no hidden gestures, and no guest password. Dojo entrance animation respects `prefers-reduced-motion`. The visual metaphor is decoration; every action still has ordinary text labels.
