"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/client-api";

export default function RegisterForm() {
  const [f, setF] = useState({ master: "", username: "", password: "", role: "b2b", display_name: "", email: "", contact: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/register", { method: "POST", body: f });
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
            <div><b>{done}</b> can now sign in{f.role === "ops" ? " to the Delivery Tracker. Ops accounts do not sign in to the CRM." : "."}</div>
          </div>
          <Link className="btn primary" href="/login">Go to sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="login">
      <form className="login-box" onSubmit={submit}>
        <div className="brand"><span className="brand-name">Snackible<small>Client record</small></span></div>
        <div>
          <h1>Register a new user</h1>
          <p className="muted" style={{ marginTop: 4 }}>You need the master admin password. Admin accounts are added in the accounts sheet by hand.</p>
        </div>
        {error && <div className="notice" role="alert"><AlertTriangle size={20} aria-hidden="true" /><div>{error}</div></div>}
        <div className="field">
          <label htmlFor="r-master">Master admin password</label>
          <input id="r-master" className="input" type="password" value={f.master} onChange={set("master")} autoComplete="off" required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="r-role">Team</label>
          <select id="r-role" className="select" value={f.role} onChange={set("role")}>
            <option value="b2b">BD (B2B team)</option>
            <option value="ops">Ops</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-name">Name shown on notes</label>
          <input id="r-name" className="input" value={f.display_name} onChange={set("display_name")} maxLength={60} required />
        </div>
        <div className="field">
          <label htmlFor="r-user">Username</label>
          <input id="r-user" className="input" value={f.username} onChange={set("username")} autoComplete="off" minLength={3} maxLength={40} required />
        </div>
        <div className="field">
          <label htmlFor="r-pass">Password</label>
          <input id="r-pass" className="input" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" minLength={6} required />
          <span className="hint">At least 6 characters.</span>
        </div>
        <div className="field">
          <label htmlFor="r-email">Email (optional)</label>
          <input id="r-email" className="input" type="email" value={f.email} onChange={set("email")} />
        </div>
        <div className="field">
          <label htmlFor="r-contact">WhatsApp number (optional)</label>
          <input id="r-contact" className="input" type="tel" value={f.contact} onChange={set("contact")} placeholder="919812345678" />
        </div>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Registering…" : "Register"}</button>
        <p><Link href="/login">Back to sign in</Link></p>
      </form>
    </main>
  );
}
