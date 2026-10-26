"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/client-api";
import Logo from "@/components/Logo";

export default function LoginForm({ mode, canRegister }) {
  const accounts = mode === "accounts";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/session", { method: "POST", body: { username, password } });
      window.location.href = "/";
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-box" onSubmit={submit}>
        <div className="brand">
          <Logo size={40} />
          <span className="brand-name">Snackible<small>Client record</small></span>
        </div>
        <div>
          <h1>Sign in</h1>
          <p className="muted" style={{ marginTop: 4 }}>Everything the team knows about each client, and what they buy.</p>
        </div>
        {error && <div className="notice" role="alert"><AlertTriangle size={20} aria-hidden="true" /><div>{error}</div></div>}
        <div className="field">
          <label htmlFor="who">{accounts ? "Username" : "Your name"}</label>
          <input id="who" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
          {!accounts && <span className="hint">Shown on the notes and facts you add.</span>}
        </div>
        <div className="field">
          <label htmlFor="pw">{accounts ? "Password" : "Team password"}</label>
          <input id="pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        <button className="btn primary" type="submit" disabled={busy || !username.trim() || !password}>{busy ? "Signing in…" : "Sign in"}</button>
        {canRegister && <p><Link href="/register">Register a new user</Link></p>}
      </form>
    </main>
  );
}
