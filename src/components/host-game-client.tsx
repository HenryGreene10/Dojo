"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DojoMark } from "@/components/dojo-mark";
import { createClient } from "@/lib/supabase/client";
import type { GamePlayer, PublicGame } from "@/lib/types";

export function HostGameClient({ gameId, configured }: { gameId: string; configured: boolean }) {
  const supabase = useMemo(() => (configured ? createClient() : null), [configured]);
  const [game, setGame] = useState<PublicGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      window.location.href = "/host";
      return;
    }
    const { data, error: rpcError } = await supabase.rpc("get_host_game", { p_game_id: gameId });
    if (rpcError) setError(rpcError.message);
    else setGame(data as PublicGame);
    setLoading(false);
  }, [gameId, supabase]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!supabase || !game?.inviteCode) return;
    const channel = supabase
      .channel(`game:${game.inviteCode}`, { config: { private: false } })
      .on("broadcast", { event: "game_changed" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [game?.inviteCode, load, supabase]);

  async function rpc(name: string, args: Record<string, unknown>) {
    if (!supabase) return;
    setBusy(true); setError(null);
    const { data, error: rpcError } = await supabase.rpc(name, args);
    setBusy(false);
    if (rpcError) setError(rpcError.message);
    else if (data) setGame(data as PublicGame);
  }

  async function copyInvite() {
    if (!game) return;
    await navigator.clipboard.writeText(`${window.location.origin}/g/${game.inviteCode}`);
  }

  async function movePlayer(player: GamePlayer, targetTableId: string) {
    await rpc("move_rsvp_to_table", {
      p_game_id: gameId,
      p_rsvp_id: player.id,
      p_target_table_id: targetTableId,
    });
  }

  if (!configured) return <main className="host-page"><div className="host-shell"><header className="host-header"><DojoMark /></header><section className="panel">Supabase is not configured yet.</section></div></main>;
  if (loading) return <main className="host-page"><div className="host-shell"><header className="host-header"><DojoMark /></header><section className="panel">Loading game…</section></div></main>;
  if (!game) return <main className="host-page"><div className="host-shell"><header className="host-header"><DojoMark /></header><section className="panel">{error ?? "Game not found."}</section></div></main>;

  return (
    <main className="host-page"><div className="host-shell">
      <header className="host-header">
        <div><DojoMark /><h1 style={{ marginTop: 18 }}>{game.title}</h1><div className="muted">{game.seatedCount}/{game.capacity} seated · {game.waitlistCount} waiting</div></div>
        <Link className="small-btn" href="/host">All games</Link>
      </header>
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
      <section className="panel">
        <div className="dojo-heading"><div><h2>Game controls</h2><span className="muted">{game.location}</span></div><button className="btn btn-primary" onClick={copyInvite}>Copy invite link</button></div>
        <div className="actions">
          <button className="small-btn" disabled={busy} onClick={() => rpc("add_game_table", { p_game_id: gameId })}>+ Add table</button>
          <button className="small-btn" disabled={busy || game.tables.length <= 1} onClick={() => rpc("remove_last_game_table", { p_game_id: gameId })}>− Remove last empty table</button>
          <Link className="small-btn" href={`/g/${game.inviteCode}`} target="_blank">Open guest view</Link>
        </div>
      </section>

      <div className="host-tables">
        {game.tables.map((table) => (
          <section className="host-table" key={table.id}>
            <h3>Table {table.tableNumber}</h3>
            {table.seats.map((seat) => (
              <div className="host-player" key={seat.id}>
                <span>{seat.player?.name ?? <span className="muted">Open seat</span>}</span>
                {seat.player && (
                  <div className="player-actions">
                    <select
                      aria-label={`Move ${seat.player.name}`}
                      className="small-btn"
                      defaultValue=""
                      disabled={busy}
                      onChange={(event) => {
                        if (event.target.value) void movePlayer(seat.player!, event.target.value);
                        event.target.value = "";
                      }}
                    >
                      <option value="">Move…</option>
                      {game.tables.filter((target) => target.id !== table.id).map((target) => <option value={target.id} key={target.id}>Table {target.tableNumber}</option>)}
                    </select>
                    <button className="icon-btn" title={`Remove ${seat.player.name}`} aria-label={`Remove ${seat.player.name}`} disabled={busy} onClick={() => rpc("remove_rsvp", { p_game_id: gameId, p_rsvp_id: seat.player!.id })}>×</button>
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>

      {game.waitlist.length > 0 && (
        <section className="panel" style={{ marginTop: 14 }}>
          <h2>Waitlist</h2>
          {game.waitlist.map((player) => (
            <div className="host-player" key={player.id}>
              <span>{player.name}</span>
              <div className="player-actions">
                <select className="small-btn" defaultValue="" disabled={busy} onChange={(event) => { if (event.target.value) void movePlayer(player, event.target.value); event.target.value = ""; }}>
                  <option value="">Seat at…</option>
                  {game.tables.map((target) => <option value={target.id} key={target.id}>Table {target.tableNumber}</option>)}
                </select>
                <button className="icon-btn" title={`Remove ${player.name}`} aria-label={`Remove ${player.name}`} disabled={busy} onClick={() => rpc("remove_rsvp", { p_game_id: gameId, p_rsvp_id: player.id })}>×</button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div></main>
  );
}
