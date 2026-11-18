"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/client-api";

export default function ResetForm({ requests }) {
  const [f, setF] = useState({ master: "", username: requests[0]?.username ?? "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/reset-password", { method: "POST", body: f });
      setDone(r.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="login">
        <div className="login-box">
          <div className="brand"><span className="brand-name">Snackible<small>Client record</small></span></div>
          <div className="notice good" role="status">
            <CheckCircle2 size={20} aria-hidden="true" />
            <div><b>{done}</b> can now sign in with the new password.</div>
          </div>
          <Link className="btn primary" href="/login">Go to sign in</Link>
        </div>
      </main>
    );
  }

  if (!requests.length) {
    return (
      <main className="login">
        <div className="login-box">
          <div className="brand"><span className="brand-name">Snackible<small>Client record</small></span></div>
          <div className="notice" role="status">
            <AlertTriangle size={20} aria-hidden="true" />
            <div>No account is currently marked for a reset. Mark a row's <b>Reset</b> column with <b>*</b> in the accounts sheet, or contact the AI team for the master admin password.</div>
          </div>
          <Link className="btn primary" href="/login">Back to sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="login">
      <form className="login-box" onSubmit={submit}>
        <div className="brand"><span className="brand-name">Snackible<small>Client record</small></span></div>
        <div>
          <h1>Reset a password</h1>
          <p className="muted" style={{ marginTop: 4 }}>You need the master admin password. Only accounts marked with a * in the accounts sheet's Reset column show up here.</p>
        </div>
        {error && <div className="notice" role="alert"><AlertTriangle size={20} aria-hidden="true" /><div>{error}</div></div>}
        <div className="field">
          <label htmlFor="rs-master">Master admin password</label>
          <input id="rs-master" className="input" type="password" value={f.master} onChange={set("master")} autoComplete="off" required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="rs-user">Account</label>
          <select id="rs-user" className="select" value={f.username} onChange={set("username")}>
            {requests.map((r) => <option key={r.username} value={r.username}>{r.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rs-pass">New password</label>
          <input id="rs-pass" className="input" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" minLength={6} required />
          <span className="hint">At least 6 characters.</span>
        </div>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Resetting…" : "Set new password"}</button>
        <p><Link href="/login">Back to sign in</Link></p>
      </form>
    </main>
  );
}
