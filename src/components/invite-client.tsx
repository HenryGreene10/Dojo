"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import type { PublicGame } from "@/lib/types";
import { TableGrid } from "@/components/table-grid";

function formatDate(startsAt: string) {
  const date = new Date(startsAt);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatTime(startsAt: string) {
  const date = new Date(startsAt);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function InviteClient({ initialGame, demo = false }: { initialGame: PublicGame; demo?: boolean }) {
  const [game, setGame] = useState(initialGame);
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const openSeats = Math.max(0, game.capacity - game.seatedCount);
  const isFull = openSeats === 0;
  const shareText = useMemo(() => `${game.title} · ${formatDate(game.startsAt)} at ${formatTime(game.startsAt)}`, [game]);

  useEffect(() => {
    const saved = window.localStorage.getItem("mahjong-dojo:name");
    if (saved) setName(saved);
  }, []);

  useEffect(() => {
    if (demo) return;
    let supabase;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    const refresh = async () => {
      const { data } = await supabase.rpc("get_public_game", { p_invite_code: game.inviteCode });
      if (data) setGame(data as PublicGame);
    };

    const channel = supabase
      .channel(`game:${game.inviteCode}`, { config: { private: false } })
      .on("broadcast", { event: "game_changed" }, refresh)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [demo, game.inviteCode]);

  async function join(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Please enter your name.");
      return;
    }

    setBusy(true);
    setError(null);
    window.localStorage.setItem("mahjong-dojo:name", cleanName);

    if (demo) {
      await new Promise((resolve) => setTimeout(resolve, 320));
      const next = structuredClone(game);
      const emptySeat = next.tables.flatMap((table) => table.seats).find((seat) => !seat.player);
      if (emptySeat) {
        emptySeat.player = { id: "demo-me", name: cleanName };
        next.seatedCount += 1;
        const table = next.tables.find((item) => item.seats.some((seat) => seat.id === emptySeat.id));
        next.myRsvp = {
          id: "demo-me",
          status: "seated",
          tableNumber: table?.tableNumber ?? null,
          seatNumber: emptySeat.seatNumber,
        };
      } else {
        next.waitlist.push({ id: "demo-me", name: cleanName });
        next.waitlistCount += 1;
        next.myRsvp = { id: "demo-me", status: "waitlisted", tableNumber: null, seatNumber: null };
      }
      setGame(next);
      setJoining(false);
      setBusy(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const { error: authError } = await supabase.auth.signInAnonymously();
        if (authError) throw authError;
      }

      const { data, error: joinError } = await supabase.rpc("join_game", {
        p_invite_code: game.inviteCode,
        p_player_name: cleanName,
      });
      if (joinError) throw joinError;
      if (data) setGame(data as PublicGame);
      setJoining(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save your seat. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelRsvp() {
    setBusy(true);
    setError(null);

    if (demo) {
      const next = structuredClone(game);
      for (const table of next.tables) {
        for (const seat of table.seats) {
          if (seat.player?.id === "demo-me") seat.player = null;
        }
      }
      next.waitlist = next.waitlist.filter((player) => player.id !== "demo-me");
      next.seatedCount = next.tables.flatMap((table) => table.seats).filter((seat) => seat.player).length;
      next.waitlistCount = next.waitlist.length;
      next.myRsvp = null;
      setGame(next);
      setBusy(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error: cancelError } = await supabase.rpc("cancel_my_rsvp", {
        p_invite_code: game.inviteCode,
      });
      if (cancelError) throw cancelError;
      if (data) setGame(data as PublicGame);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't cancel your RSVP.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: game.title, text: shareText, url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  }

  return (
    <>
      {!reduceMotion && (
        <motion.div
          className="door-overlay"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ delay: 0.85, duration: 0.15 }}
          aria-hidden="true"
        >
          <motion.div className="door door-left" initial={{ x: 0 }} animate={{ x: "-104%" }} transition={{ delay: 0.18, duration: 0.75, ease: [0.76, 0, 0.24, 1] }} />
          <motion.div className="door door-right" initial={{ x: 0 }} animate={{ x: "104%" }} transition={{ delay: 0.18, duration: 0.75, ease: [0.76, 0, 0.24, 1] }} />
        </motion.div>
      )}

      <article className="invite-card">
        <header className="invite-hero">
          <div className="eyebrow">Hosted by {game.hostName}</div>
          <h1>{game.title}</h1>
          <div className="invite-meta">
            <span>{formatDate(game.startsAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatTime(game.startsAt)}</span>
          </div>
          <div className="invite-location">{game.location}</div>
        </header>

        <div className="invite-body">
          <div className="capacity-row">
            <div>
              <h2>{game.dojoName}</h2>
              <p>{game.seatedCount} of {game.capacity} seats taken{game.waitlistCount ? ` · ${game.waitlistCount} waiting` : ""}</p>
            </div>
            <button className="small-btn" type="button" onClick={share}>Share</button>
          </div>

          <TableGrid tables={game.tables} />

          {game.waitlist.length > 0 && (
            <div className="waitlist">
              <h3>Waiting for a seat</h3>
              <div className="waitlist-names">
                {game.waitlist.map((player) => <span className="waitlist-name" key={player.id}>{player.name}</span>)}
              </div>
            </div>
          )}

          <div className="join-panel">
            {game.myRsvp ? (
              <div>
                <div className="status-card">
                  <strong>{game.myRsvp.status === "seated" ? `You're at Table ${game.myRsvp.tableNumber}.` : "You're on the waitlist."}</strong>
                  {game.myRsvp.status === "seated" ? "Your seat is saved. See you at the table." : "We'll move you in automatically if a seat opens."}
                </div>
                <button className="btn btn-danger btn-wide" style={{ marginTop: 10 }} type="button" onClick={cancelRsvp} disabled={busy}>
                  {busy ? "Updating…" : "I can't make it"}
                </button>
              </div>
            ) : game.status !== "open" ? (
              <div className="status-card"><strong>RSVPs are closed.</strong>The host has closed this game.</div>
            ) : (
              <AnimatePresence mode="wait">
                {!joining ? (
                  <motion.div key="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <button className="btn btn-primary btn-wide" type="button" onClick={() => setJoining(true)}>
                      {isFull ? "Join the waitlist" : "Enter the dojo"}
                    </button>
                  </motion.div>
                ) : (
                  <motion.form className="join-form" key="form" onSubmit={join} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <div>
                      <label className="label" htmlFor="player-name">Your name</label>
                      <input
                        autoFocus
                        className="input"
                        id="player-name"
                        maxLength={60}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Barbara"
                        value={name}
                      />
                    </div>
                    {error && <div className="error" role="alert">{error}</div>}
                    <button className="btn btn-primary btn-wide" disabled={busy} type="submit">
                      {busy ? "Finding your seat…" : isFull ? "Join the waitlist" : "Take a seat"}
                    </button>
                    <button className="small-btn" type="button" onClick={() => setJoining(false)} disabled={busy}>Never mind</button>
                  </motion.form>
                )}
              </AnimatePresence>
            )}
            {!joining && error && <div className="error" role="alert" style={{ marginTop: 10 }}>{error}</div>}
          </div>
        </div>
      </article>
    </>
  );
}
