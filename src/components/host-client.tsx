"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DojoMark } from "@/components/dojo-mark";
import { createClient } from "@/lib/supabase/client";
import type { HostDashboardDojo } from "@/lib/types";

export function HostClient({ configured }: { configured: boolean }) {
  const [loading, setLoading] = useState(configured);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dojos, setDojos] = useState<HostDashboardDojo[]>([]);
  const [title, setTitle] = useState("Mah Jong");
  const [hostName, setHostName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [tableCount, setTableCount] = useState(2);
  const [busy, setBusy] = useState(false);

  const supabase = useMemo(() => (configured ? createClient() : null), [configured]);

  const loadDashboard = useCallback(async () => {
    if (!supabase) return;
    const { data, error: dashboardError } = await supabase.rpc("get_host_dashboard");
    if (dashboardError) {
      setError(dashboardError.message);
      return;
    }
    setDojos((data ?? []) as HostDashboardDojo[]);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    const savedName = window.localStorage.getItem("mahjong-dojo-host-name");
    if (savedName) setHostName(savedName);

    let active = true;

    void (async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (!sessionData.session) {
          const { error: signInError } = await supabase.auth.signInAnonymously();
          if (signInError) throw signInError;
        }

        if (active) await loadDashboard();
      } catch (err) {
        if (active) {
          const detail = err instanceof Error ? err.message : "Unknown error";
          setError(`Could not start this room on this device. ${detail}`);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadDashboard, supabase]);

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !startsAt || !hostName.trim() || !title.trim() || !location.trim()) return;

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      let dojoId = dojos[0]?.id;

      if (!dojoId) {
        const { data: dojo, error: dojoError } = await supabase.rpc("create_dojo", {
          p_name: "Mah Jong group",
        });
        if (dojoError) throw dojoError;
        dojoId = dojo?.id;
      }

      if (!dojoId) throw new Error("Could not create the group for this room.");

      const { data, error: gameError } = await supabase.rpc("create_game", {
        p_dojo_id: dojoId,
        p_title: title.trim(),
        p_host_name: hostName.trim(),
        p_starts_at: new Date(startsAt).toISOString(),
        p_location: location.trim(),
        p_table_count: tableCount,
      });
      if (gameError) throw gameError;

      window.localStorage.setItem("mahjong-dojo-host-name", hostName.trim());
      await loadDashboard();

      if (data?.id) {
        window.location.href = `/host/g/${data.id}`;
        return;
      }

      setMessage("Room created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the room.");
    } finally {
      setBusy(false);
    }
  }

  const games = dojos.flatMap((dojo) => dojo.games);

  if (!configured) {
    return (
      <main className="host-page"><div className="host-shell">
        <header className="host-header"><DojoMark /><span className="seat-pill">Setup needed</span></header>
        <section className="panel"><h2>Connect Supabase</h2><p className="muted">Copy <code>.env.example</code> to <code>.env.local</code>, add your project URL and publishable key, then restart the dev server.</p><Link className="btn btn-secondary" href="/g/demo">Open the demo</Link></section>
      </div></main>
    );
  }

  if (loading) {
    return <main className="host-page"><div className="host-shell"><header className="host-header"><DojoMark /></header><section className="panel">Setting up your room…</section></div></main>;
  }

  return (
    <main className="host-page"><div className="host-shell">
      <header className="host-header">
        <div><DojoMark /><h1 style={{ marginTop: 18 }}>Host Mah Jong</h1></div>
      </header>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="eyebrow">Create a room</div>
        <h2>Make the game. Text the link.</h2>
        <p className="muted">No account or email. You create the room here, then send one invite link to the group chat. Guests open it, add their name, and get a seat.</p>

        <form className="form-grid" onSubmit={createRoom}>
          <div><label className="label">Your name</label><input className="input" required maxLength={60} value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="Susan" /></div>
          <div><label className="label">Game name</label><input className="input" required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className="label">Date & time</label><input className="input" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
          <div><label className="label">Tables</label><select className="select" value={tableCount} onChange={(e) => setTableCount(Number(e.target.value))}>{Array.from({ length: 8 }, (_, index) => index + 1).map((count) => <option value={count} key={count}>{count} table{count === 1 ? "" : "s"} · {count * 4} seats</option>)}</select></div>
          <div className="full"><label className="label">Location</label><input className="input" required maxLength={240} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Susan's house · 12 Maple Lane" /></div>
          {error && <div className="error full">{error}</div>}
          {message && <div className="status-card full">{message}</div>}
          <div className="full"><button className="btn btn-primary btn-wide" disabled={busy}>{busy ? "Creating room…" : "Create invite"}</button></div>
        </form>
      </section>

      {games.length > 0 && (
        <section className="dojo-section">
          <div className="dojo-heading"><div><h2>Your upcoming games</h2><span className="muted">This browser remembers the rooms you created.</span></div></div>
          <div className="game-list">
            {games.map((game) => (
              <div className="game-row" key={game.id}>
                <div><strong>{game.title}</strong><span className="muted">{new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(game.startsAt))} · {game.seatedCount}/{game.capacity} seated</span></div>
                <div className="game-row-actions"><button className="small-btn" onClick={async () => { await navigator.clipboard.writeText(`${window.location.origin}/g/${game.inviteCode}`); setMessage("Invite link copied."); }}>Copy invite</button><Link className="small-btn" href={`/host/g/${game.id}`}>Manage</Link></div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div></main>
  );
}
