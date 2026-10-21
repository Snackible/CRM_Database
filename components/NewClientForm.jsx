"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { SEGMENTS } from "@/lib/constants";
import { api } from "@/lib/client-api";

export default function NewClientForm({ owners = [], me = "" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [f, setF] = useState({
    name: params.get("name") ?? "", code: "", segment: "", owner: me,
    email: params.get("email") ?? "", phone: params.get("phone") ?? "", city: "", gstin: "",
  });
  const [people, setPeople] = useState([{ name: "", role: "", phone: "", email: "" }]);
  const [custom, setCustom] = useState([]);
  const [twin, setTwin] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const linkKey = params.get("linkKey");

  async function submit(e, force = false) {
    e?.preventDefault();
    if (!f.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { id } = await api("/api/clients", { method: "POST", body: { ...f, people, custom, force, linkKey } });
      router.push(`/clients/${id}`);
      router.refresh();
    } catch (err) {
      if (err.status === 409 && err.data?.duplicate) setTwin(err.data.duplicate);
      else setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="page-head">
        <div>
          <h1>New client</h1>
          <p>Only the name is required. Everything else can be added later from the client page.{linkKey ? " The unmatched rows from this buyer will be linked to the new client." : ""}</p>
        </div>
      </div>

      {twin && (
        <div className="notice" role="alert" style={{ marginBottom: 16 }}>
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <b>{twin.name}</b> ({[twin.code, twin.city].filter(Boolean).join(", ") || "existing client"}) already has a matching name, code, email or phone.
            <div className="row" style={{ marginTop: 8 }}>
              <Link className="btn sm" href={`/clients/${twin.id}`}>Open {twin.name}</Link>
              <button type="button" className="btn sm" onClick={() => submit(null, true)} disabled={busy}>It is a different business: create anyway</button>
            </div>
          </div>
        </div>
      )}
      {error && <div className="notice" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <section className="panel" aria-labelledby="id-h">
        <div className="panel-head"><h2 id="id-h">The business</h2></div>
        <div className="panel-body">
          <div className="field">
            <label htmlFor="c-name">Name</label>
            <input id="c-name" className="input" required value={f.name} onChange={set("name")} placeholder="Greenleaf Mart" autoFocus />
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="c-code">Client code</label>
              <input id="c-code" className="input mono" value={f.code} onChange={set("code")} placeholder="SN-0460" />
              <span className="hint">Matches purchase CSV rows. Leave empty if you have none.</span>
            </div>
            <div className="field">
              <label htmlFor="c-seg">Segment</label>
              <input id="c-seg" className="input" list="segments" value={f.segment} onChange={set("segment")} placeholder="Choose or type" />
              <datalist id="segments">{SEGMENTS.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div className="field">
              <label htmlFor="c-owner">Owner</label>
              <input id="c-owner" className="input" list="owners" value={f.owner} onChange={set("owner")} />
              <datalist id="owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>
            </div>
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="c-email">Email</label>
              <input id="c-email" className="input" type="email" value={f.email} onChange={set("email")} />
            </div>
            <div className="field">
              <label htmlFor="c-phone">Phone</label>
              <input id="c-phone" className="input" type="tel" value={f.phone} onChange={set("phone")} placeholder="+91 98xxx xxxxx" />
            </div>
            <div className="field">
              <label htmlFor="c-city">City</label>
              <input id="c-city" className="input" value={f.city} onChange={set("city")} />
            </div>
          </div>
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="c-gst">GSTIN</label>
            <input id="c-gst" className="input mono" value={f.gstin} onChange={set("gstin")} maxLength={15} placeholder="29AABCG4421K1Z7" />
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="ppl-h">
        <div className="panel-head">
          <h2 id="ppl-h">People we talk to</h2>
          <button type="button" className="btn sm" onClick={() => setPeople([...people, { name: "", role: "", phone: "", email: "" }])}><Plus size={15} aria-hidden="true" /> Add person</button>
        </div>
        <div className="panel-body repeat">
          {people.map((p, i) => (
            <div className="repeat-row" key={i}>
              {["name", "role", "phone", "email"].map((k) => (
                <div className="field" key={k}>
                  <label htmlFor={`p-${i}-${k}`}>{k[0].toUpperCase() + k.slice(1)}</label>
                  <input id={`p-${i}-${k}`} className="input" value={p[k]} onChange={(e) => setPeople(people.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
                </div>
              ))}
              <button type="button" className="icon-btn" aria-label={`Remove person ${i + 1}`} onClick={() => setPeople(people.filter((_, j) => j !== i))}><Trash2 size={18} aria-hidden="true" /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="cf-h">
        <div className="panel-head">
          <h2 id="cf-h">Your own fields</h2>
          <button type="button" className="btn sm" onClick={() => setCustom([...custom, { k: "", v: "" }])}><Plus size={15} aria-hidden="true" /> Add field</button>
        </div>
        <div className="panel-body repeat">
          {custom.length === 0 && <p className="muted">Anything that has no box above, such as “Vendor code” or “Store count”. They are saved as facts.</p>}
          {custom.map((c, i) => (
            <div className="repeat-row kv" key={i}>
              <div className="field"><label htmlFor={`k-${i}`}>Name</label><input id={`k-${i}`} className="input" value={c.k} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} /></div>
              <div className="field"><label htmlFor={`v-${i}`}>Value</label><input id={`v-${i}`} className="input" value={c.v} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} /></div>
              <button type="button" className="icon-btn" aria-label={`Remove field ${i + 1}`} onClick={() => setCustom(custom.filter((_, j) => j !== i))}><Trash2 size={18} aria-hidden="true" /></button>
            </div>
          ))}
        </div>
      </section>

      <div className="sticky-actions">
        <Link className="btn quiet" href="/clients">Cancel</Link>
        <button className="btn primary" type="submit" disabled={!f.name.trim() || busy}>{busy ? "Saving…" : "Save client"}</button>
      </div>
    </form>
  );
}
