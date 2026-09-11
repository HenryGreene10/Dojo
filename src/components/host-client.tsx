"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { DojoMark } from "@/components/dojo-mark";
import { createClient } from "@/lib/supabase/client";
import type { HostDashboardDojo } from "@/lib/types";

export function HostClient({ configured }: { configured: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dojos, setDojos] = useState<HostDashboardDojo[]>([]);
  const [dojoName, setDojoName] = useState("");
  const [showGameForm, setShowGameForm] = useState(false);
  const [title, setTitle] = useState("Mah Jong");
  const [hostName, setHostName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("");
  const [tableCount, setTableCount] = useState(2);
  const [dojoId, setDojoId] = useState("");
  const [busy, setBusy] = useState(false);

  const supabase = useMemo(() => (configured ? createClient() : null), [configured]);

  const loadDashboard = useCallback(async () => {
    if (!supabase) return;
    const { data, error: dashboardError } = await supabase.rpc("get_host_dashboard");
    if (dashboardError) {
      setError(dashboardError.message);
      return;
    }
    const next = (data ?? []) as HostDashboardDojo[];
    setDojos(next);
    if (!dojoId && next[0]) setDojoId(next[0].id);
  }, [dojoId, supabase]);

  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
      if (data.user) await loadDashboard();
      setLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) void loadDashboard();
      else setDojos([]);
    });
    return () => listener.subscription.unsubscribe();
  }, [loadDashboard, supabase]);

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(null); setMessage(null);
    const redirect = `${window.location.origin}/auth/callback?next=/host`;
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirect },
    });
    setBusy(false);
    if (authError) setError(authError.message);
    else setMessage("Check your email for the sign-in link.");
  }

  async function createDojo(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !dojoName.trim()) return;
    setBusy(true); setError(null);
    const { error: rpcError } = await supabase.rpc("create_dojo", { p_name: dojoName.trim() });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    setDojoName("");
    await loadDashboard();
  }

  async function createGame(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !dojoId || !startsAt) return;
    setBusy(true); setError(null);
    const { data, error: rpcError } = await supabase.rpc("create_game", {
      p_dojo_id: dojoId,
      p_title: title.trim(),
      p_host_name: hostName.trim(),
      p_starts_at: new Date(startsAt).toISOString(),
      p_location: location.trim(),
      p_table_count: tableCount,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    setShowGameForm(false);
    await loadDashboard();
    if (data?.id) window.location.href = `/host/g/${data.id}`;
  }

  async function createHostInvite(dojo: HostDashboardDojo) {
    if (!supabase) return;
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("create_host_invite", { p_dojo_id: dojo.id });
    if (rpcError) return setError(rpcError.message);
    const url = `${window.location.origin}/host/invite/${data.token}`;
    await navigator.clipboard.writeText(url);
    setMessage(`Host invite for ${dojo.name} copied.`);
  }

  if (!configured) {
    return (
      <main className="host-page"><div className="host-shell">
        <header className="host-header"><DojoMark /><span className="seat-pill">Setup needed</span></header>
        <section className="panel"><h2>Connect Supabase</h2><p className="muted">Copy <code>.env.example</code> to <code>.env.local</code>, add your project URL and publishable key, then apply the migration in <code>supabase/migrations</code>.</p><Link className="btn btn-secondary" href="/g/demo">Open the working demo</Link></section>
      </div></main>
    );
  }

  if (loading) return <main className="host-page"><div className="host-shell"><header className="host-header"><DojoMark /></header><section className="panel">Opening the dojo…</section></div></main>;

  if (!user) {
    return (
      <main className="host-page"><div className="host-shell">
        <header className="host-header"><DojoMark /></header>
        <section className="panel" style={{ maxWidth: 560, margin: "70px auto 0" }}>
          <div className="eyebrow">For hosts</div><h2>Welcome back.</h2>
          <p className="muted">Hosts sign in. Your guests never have to.</p>
          <form className="join-form" onSubmit={sendMagicLink}>
            <div><label className="label" htmlFor="host-email">Email</label><input className="input" id="host-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
            {error && <div className="error">{error}</div>}{message && <div className="status-card">{message}</div>}
            <button className="btn btn-primary btn-wide" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
          </form>
        </section>
      </div></main>
    );
  }

  return (
    <main className="host-page"><div className="host-shell">
      <header className="host-header">
        <div><DojoMark /><h1 style={{ marginTop: 18 }}>Your dojos</h1></div>
        <button className="small-btn" onClick={() => supabase?.auth.signOut()}>Sign out</button>
      </header>

      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
      {message && <div className="status-card" style={{ marginBottom: 12 }}>{message}</div>}

      {dojos.length > 0 && (
        <div className="actions" style={{ marginBottom: 20 }}>
          <button className="btn btn-primary" onClick={() => setShowGameForm((value) => !value)}>{showGameForm ? "Close" : "Host a game"}</button>
        </div>
      )}

      {showGameForm && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <h2>Host a game</h2><p className="muted">Create it, then drop the invite link straight into the group chat.</p>
          <form className="form-grid" onSubmit={createGame}>
            <div><label className="label">Dojo</label><select className="select" value={dojoId} onChange={(e) => setDojoId(e.target.value)}>{dojos.map((dojo) => <option key={dojo.id} value={dojo.id}>{dojo.name}</option>)}</select></div>
            <div><label className="label">Host name</label><input className="input" required maxLength={60} value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="Susan" /></div>
            <div><label className="label">Game name</label><input className="input" required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><label className="label">Date & time</label><input className="input" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
            <div className="full"><label className="label">Location</label><input className="input" required maxLength={240} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Susan's house · 12 Maple Lane" /></div>
            <div><label className="label">Tables</label><select className="select" value={tableCount} onChange={(e) => setTableCount(Number(e.target.value))}>{Array.from({ length: 8 }, (_, index) => index + 1).map((count) => <option value={count} key={count}>{count} table{count === 1 ? "" : "s"} · {count * 4} seats</option>)}</select></div>
            <div style={{ alignSelf: "end" }}><button className="btn btn-primary btn-wide" disabled={busy}>{busy ? "Creating…" : "Create game"}</button></div>
          </form>
        </section>
      )}

      {dojos.map((dojo) => (
        <section className="dojo-section" key={dojo.id}>
          <div className="dojo-heading"><div><h2>{dojo.name}</h2><span className="muted">{dojo.role === "owner" ? "You own this dojo" : "You can host here"}</span></div>{dojo.role === "owner" && <button className="small-btn" onClick={() => createHostInvite(dojo)}>Invite a host</button>}</div>
          <div className="game-list">
            {dojo.games.length === 0 ? <div className="panel muted">No upcoming games yet.</div> : dojo.games.map((game) => (
              <div className="game-row" key={game.id}>
                <div><strong>{game.title}</strong><span className="muted">{new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(game.startsAt))} · {game.seatedCount}/{game.capacity} seated</span></div>
                <div className="game-row-actions"><button className="small-btn" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/g/${game.inviteCode}`)}>Copy invite</button><Link className="small-btn" href={`/host/g/${game.id}`}>Manage</Link></div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="panel" style={{ marginTop: 28 }}>
        <h2>{dojos.length ? "Another group?" : "Create your first dojo"}</h2><p className="muted">A dojo is the recurring friend group. It can have many hosts and many games.</p>
        <form className="actions" onSubmit={createDojo}><input className="input" style={{ flex: 1, minWidth: 230 }} maxLength={80} required value={dojoName} onChange={(e) => setDojoName(e.target.value)} placeholder="Thursday Mah Jong" /><button className="btn btn-secondary" disabled={busy}>Create dojo</button></form>
      </section>
    </div></main>
  );
}
