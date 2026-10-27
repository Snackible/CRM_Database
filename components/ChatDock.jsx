"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, Send, X } from "lucide-react";
import { api } from "@/lib/client-api";
import AnswerView from "@/components/AnswerView";

const HOME = ["How are we doing?", "Who has gone quiet?", "Compare this month with last month", "Who is ordering less?", "Top 10 clients this year", "Help"];
const CLIENT = ["Tell me about this client", "Recent orders", "What do they buy?", "Their last order", "Payment terms", "Notes"];

/**
 * A chat over the CRM's own data. Answers are rules over queries, not a model: free, unlimited and exact.
 * Opened from the top bar on any page; on a client's page it starts out talking about that client.
 */
export default function ChatDock({ open, onClose }) {
  const router = useRouter();
  const pathname = usePathname();
  const pageClient = (pathname.match(/^\/clients\/(\d+)$/) ?? [])[1];
  const [messages, setMessages] = useState([]);
  const [ctx, setCtx] = useState({ clientId: null, clientName: null, last: null, fromPage: false });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);
  const inputRef = useRef(null);

  // opening a client's page points the chat at that client; leaving it lets go, unless the person chose a client themselves
  useEffect(() => {
    if (pageClient) setCtx((c) => (c.clientId === Number(pageClient) ? c : { clientId: Number(pageClient), clientName: null, last: null, fromPage: true }));
    else setCtx((c) => (c.fromPage ? { clientId: null, clientName: null, last: null, fromPage: false } : c));
  }, [pageClient]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const push = (m) => setMessages((all) => [...all, { id: all.length + 1, ...m }]);

  async function ask(q) {
    const question = (q ?? text).trim();
    if (!question || busy) return;
    setText("");
    push({ role: "user", text: question });
    setBusy(true);
    try {
      const res = await api("/api/ask", { method: "POST", body: { q: question, ctx: { clientId: ctx.clientId, clientName: ctx.clientName, last: ctx.last } } });
      push({ role: "bot", res });
      if (res.context) setCtx((c) => ({ ...res.context, fromPage: res.context.clientId === c.clientId ? c.fromPage : false }));
    } catch (e) {
      push({ role: "bot", res: { title: "That didn't work", summary: e.message } });
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(client, body) {
    setBusy(true);
    try {
      await api(`/api/clients/${client.id}/notes`, { method: "POST", body: { body } });
      push({ role: "bot", res: { title: "Note saved", summary: `Added to ${client.name}.`, href: `/clients/${client.id}` } });
      router.refresh();
    } catch (e) {
      push({ role: "bot", res: { title: "The note was not saved", summary: e.message } });
    } finally {
      setBusy(false);
    }
  }

  const last = [...messages].reverse().find((m) => m.role === "bot");
  const chips = (last?.res?.suggestions?.length ? last.res.suggestions : ctx.clientId ? CLIENT : HOME).slice(0, 6);

  return (
    <aside className="chat" hidden={!open} role="dialog" aria-label="Ask about your clients" aria-modal="false">
      <header className="chat-head">
        <h2><MessageSquare size={20} aria-hidden="true" /> Ask</h2>
        <button className="btn quiet sm" onClick={onClose} aria-label="Close chat"><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="chat-about">
        {ctx.clientId ? (
          <>
            <span>About <b>{ctx.clientName ?? "this client"}</b></span>
            <button className="btn quiet sm" onClick={() => setCtx({ clientId: null, clientName: null, last: null, fromPage: false })}>Ask about everything instead</button>
          </>
        ) : (
          <span>About the whole business. Name a client to talk about them.</span>
        )}
      </div>

      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.length === 0 && (
          <p className="muted chat-empty">Ask about the business or one client. Answers come straight from your data, free and with no limit. Say “help” to see what it understands.</p>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div className="msg user" key={m.id}>{m.text}</div>
          ) : (
            <div className="msg bot" key={m.id}>
              <AnswerView compact res={m.res} busy={busy} onSaveNote={saveNote} onCancelNote={() => push({ role: "bot", res: { title: "Cancelled", summary: "The note was not saved." } })} />
            </div>
          ),
        )}
        {busy && <div className="msg bot muted" role="status">Looking it up…</div>}
      </div>

      <div className="chat-chips">
        {chips.map((c) => (
          <button key={c} className="btn sm" onClick={() => ask(c)} disabled={busy}>{c}</button>
        ))}
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input ref={inputRef} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={ctx.clientId ? "Ask about this client, or say note: …" : "Ask about clients, orders, leads…"} aria-label="Your question" maxLength={300} />
        <button className="btn primary" type="submit" disabled={busy || !text.trim()} aria-label="Send"><Send size={17} aria-hidden="true" /></button>
      </form>
    </aside>
  );
}
