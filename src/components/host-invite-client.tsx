"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { DojoMark } from "@/components/dojo-mark";
import { createClient } from "@/lib/supabase/client";

export function HostInviteClient({ token, configured }: { token: string; configured: boolean }) {
  const supabase = useMemo(() => (configured ? createClient() : null), [configured]);
  const [dojoName, setDojoName] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const [{ data: invite }, { data: authData }] = await Promise.all([
        supabase.rpc("get_host_invite_info", { p_token: token }),
        supabase.auth.getUser(),
      ]);
      setDojoName(invite?.dojoName ?? null);
      setUser(authData.user ?? null);
    })();
  }, [supabase, token]);

  async function signIn(event: FormEvent) {
    event.preventDefault(); if (!supabase) return;
    setBusy(true); setError(null);
    const next = `/host/invite/${token}`;
    const { error: authError } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    setBusy(false);
    if (authError) setError(authError.message); else setMessage("Check your email, then come right back here.");
  }

  async function accept() {
    if (!supabase) return;
    setBusy(true); setError(null);
    const { data, error: rpcError } = await supabase.rpc("accept_host_invite", { p_token: token });
    setBusy(false);
    if (rpcError) setError(rpcError.message);
    else window.location.href = `/host?joined=${encodeURIComponent(data.dojoName)}`;
  }

  return <main className="host-page"><div className="host-shell">
    <header className="host-header"><DojoMark /></header>
    <section className="panel" style={{ maxWidth: 580, margin: "70px auto 0" }}>
      <div className="eyebrow">Host invitation</div>
      <h2>{dojoName ? `Join ${dojoName}` : "Join this dojo"}</h2>
      <p className="muted">Hosts can create games and manage tables. Guests still join from the ordinary one-tap game link.</p>
      {!configured ? <div className="error">Supabase is not configured.</div> : !dojoName ? <div className="error">This invite is invalid or has expired.</div> : user ? <button className="btn btn-primary btn-wide" disabled={busy} onClick={accept}>{busy ? "Joining…" : "Join as a host"}</button> : <form className="join-form" onSubmit={signIn}><div><label className="label">Email</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>{error && <div className="error">{error}</div>}{message && <div className="status-card">{message}</div>}<button className="btn btn-primary btn-wide" disabled={busy}>{busy ? "Sending…" : "Sign in to accept"}</button></form>}
      {error && user && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
    </section>
  </div></main>;
}
