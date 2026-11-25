"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/client-api";

// Two steps: the password of an admin marked with a * in the accounts sheet's Reset column, then - only once
// that checks out - the list of accounts and the new password. Nobody without one ever sees who has an account.
export default function ResetForm({ enabled }) {
  const [admin, setAdmin] = useState("");
  const [accounts, setAccounts] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  async function unlock(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/reset-password", { method: "POST", body: { action: "list", admin } });
      setAccounts(r.accounts);
      setUsername(r.accounts[0]?.username ?? "");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/reset-password", { method: "POST", body: { admin, username, password } });
      setDone(accounts.find((a) => a.username === r.username)?.name ?? r.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function another() {
    setDone("");
    setPassword("");
    setError("");
  }

  const brand = <div className="brand"><span className="brand-name">Snackible<small>Client record</small></span></div>;
  const problem = error && <div className="notice" role="alert"><AlertTriangle size={20} aria-hidden="true" /><div>{error}</div></div>;

  if (!enabled) {
    return (
      <main className="login">
        <div className="login-box">
          {brand}
          <div className="notice" role="status">
            <AlertTriangle size={20} aria-hidden="true" />
            <div>Resetting isn't switched on. Put a <b>*</b> in an admin's <b>Reset</b> cell in the accounts sheet, then use that admin's password here - or contact the AI team.</div>
          </div>
          <Link className="btn primary" href="/login">Back to sign in</Link>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="login">
        <div className="login-box">
          {brand}
          <div className="notice good" role="status">
            <CheckCircle2 size={20} aria-hidden="true" />
            <div><b>{done}</b> can now sign in with the new password.</div>
          </div>
          <button className="btn" type="button" onClick={another}>Reset another account</button>
          <Link className="btn primary" href="/login">Go to sign in</Link>
        </div>
      </main>
    );
  }

  if (!accounts) {
    return (
      <main className="login">
        <form className="login-box" onSubmit={unlock}>
          {brand}
          <div>
            <h1>Reset a password</h1>
            <p className="muted" style={{ marginTop: 4 }}>Enter the password of an admin marked with a * in the accounts sheet's Reset column.</p>
          </div>
          {problem}
          <div className="field">
            <label htmlFor="rs-admin">Admin password</label>
            <input id="rs-admin" className="input" type="password" value={admin} onChange={(e) => setAdmin(e.target.value)} autoComplete="off" required autoFocus />
          </div>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
          <p><Link href="/login">Back to sign in</Link></p>
        </form>
      </main>
    );
  }

  return (
    <main className="login">
      <form className="login-box" onSubmit={save}>
        {brand}
        <div>
          <h1>Reset a password</h1>
          <p className="muted" style={{ marginTop: 4 }}>Pick the account and set its new password.</p>
        </div>
        {problem}
        <div className="field">
          <label htmlFor="rs-user">Account</label>
          <select id="rs-user" className="select" value={username} onChange={(e) => setUsername(e.target.value)}>
            {accounts.map((a) => <option key={a.username} value={a.username}>{a.name === a.username ? a.username : `${a.name} (${a.username})`}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rs-pass">New password</label>
          <input id="rs-pass" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} maxLength={100} required />
          <span className="hint">At least 6 characters.</span>
        </div>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Resetting…" : "Set new password"}</button>
        <p><Link href="/login">Back to sign in</Link></p>
      </form>
    </main>
  );
}
