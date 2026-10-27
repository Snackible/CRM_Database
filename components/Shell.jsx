"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, Check, MessageSquare, DatabaseBackup, FileText, LayoutDashboard, Lightbulb, Palette, Plus, Receipt, RefreshCw, Search, Target, Unlink, Upload, Users } from "lucide-react";
import { THEMES, THEME_KEY } from "@/lib/themes";
import { api } from "@/lib/client-api";
import Logo from "@/components/Logo";
import ChatDock from "@/components/ChatDock";

const ADD = [
  { href: "/clients/new", label: "New client", desc: "Name, contacts, terms", icon: Building2 },
  { href: "/purchases/new", label: "Purchase", desc: "One order, entered by hand", icon: Receipt },
  { href: "/purchases/import", label: "Purchase CSV or sheet", desc: "Upload an export or connect a Google Sheet", icon: Upload },
  { href: "/documents/new", label: "Information", desc: "Note, fact, document or pasted text", icon: FileText },
];

function active(pathname, href) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export default function Shell({ children, user, role = "b2b", unmatched = 0, sample = 0, extent = {} }) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [theme, setThemeState] = useState("safelight");
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState("");
  const inputRef = useRef(null);

  // A short bar under a nav item shows how big that section is, against the biggest of the three.
  const biggest = Math.max(1, extent.clients ?? 0, extent.leads ?? 0, extent.unmatched ?? 0);
  const bar = (n) => (n ? `${Math.max(6, Math.round((n / biggest) * 100))}%` : undefined);

  const NAV = [
    { href: "/", label: "Overview", short: "Home", icon: LayoutDashboard },
    { href: "/clients", label: "Clients", icon: Users, extent: bar(extent.clients) },
    { href: "/leads", label: "Leads", icon: Target, extent: bar(extent.leads) },
    { href: "/insights", label: "Insights", icon: Lightbulb },
    { href: "/unmatched", label: "Unmatched", icon: Unlink, count: unmatched, extent: bar(extent.unmatched) },
    { href: "/imports", label: "Imports & backup", short: "Imports", icon: DatabaseBackup },
  ];

  useEffect(() => {
    setThemeState(document.documentElement.dataset.theme || "safelight");
  }, []);

  function chooseTheme(id) {
    document.documentElement.dataset.theme = id;
    setThemeState(id);
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {}
  }

  useEffect(() => {
    setOpen(false);
    setAddOpen(false);
    setThemeOpen(false);
    setQ("");
  }, [pathname]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setOpen(false);
        setAddOpen(false);
        setThemeOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Search as you type, a beat after the last key.
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const { results } = await api(`/api/search?q=${encodeURIComponent(q.trim())}`);
        if (live) setHits(results.slice(0, 8));
      } catch {
        if (live) setHits([]);
      }
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  async function resync() {
    setSyncing(true);
    setSyncNote("Reading the sheets…");
    let note;
    try {
      const r = await api("/api/sheets/sync", { method: "POST" });
      if (r.busy) note = "Synced moments ago";
      else if (r.failed.length) note = `Could not read ${r.failed.join(", ")}`;
      else note = r.added ? `${r.added.toLocaleString("en-IN")} new ${r.added === 1 ? "row" : "rows"}` : "Up to date";
      router.refresh();
    } catch (e) {
      note = e.message;
    }
    setSyncing(false);
    setSyncNote(note);
    setTimeout(() => setSyncNote(""), 8000);
  }

  async function signOut() {
    await api("/api/session", { method: "DELETE" }).catch(() => {});
    window.location.href = "/login";
  }

  return (
    <div className="app">
      <aside className="rail" aria-label="Main">
        <Link href="/" className="brand">
          <Logo />
          <span className="brand-name">Snackible<small>Client record</small></span>
        </Link>
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(pathname, n.href) ? "page" : undefined}>
              <n.icon size={19} strokeWidth={1.9} aria-hidden="true" />
              {n.label}
              {n.count ? <span className="count" aria-label={`${n.count} waiting`}>{n.count}</span> : null}
              {n.extent && <i className="extent" style={{ width: n.extent }} aria-hidden="true" />}
            </Link>
          ))}
        </nav>
        <div className="rail-foot">
          <strong>{user}</strong>
          <span>{role === "admin" ? "Admin" : "B2B team"}</span>
          <br />
          {sample > 0 && <span>Sample data in use</span>}
          {sample > 0 && <br />}
          <button className="btn quiet sm" onClick={signOut} style={{ padding: 0, height: "auto" }}>Sign out</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Link href="/" className="topbar-mark" aria-label="Snackible CRM, overview"><Logo size={36} className="" /></Link>
          <form
            className="search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search className="ico" size={17} aria-hidden="true" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search clients, people, facts, notes"
              aria-label="Search everything"
              autoComplete="off"
            />
            <kbd aria-hidden="true">Ctrl K</kbd>
            {open && q.trim().length > 1 && (
              <div className="results" role="listbox">
                {hits.length === 0 && <div className="none">Nothing matches “{q}”.</div>}
                {hits.map((h, i) => (
                  <Link key={i} href={`/clients/${h.clientId}`} role="option">
                    <div className="t">{h.title.length > 90 ? `${h.title.slice(0, 90)}…` : h.title}</div>
                    <div className="d">{h.type} · {h.detail}</div>
                  </Link>
                ))}
                {hits.length > 0 && (
                  <Link href={`/search?q=${encodeURIComponent(q.trim())}`}>
                    <div className="t">See all results for “{q}”</div>
                  </Link>
                )}
              </div>
            )}
          </form>
          <div className="topbar-spacer" />
          {syncNote && <span className="sync-note" role="status">{syncNote}</span>}
          <button className="btn icon" aria-label="Ask about your clients" title="Ask" aria-expanded={chatOpen} onClick={() => { setChatOpen((v) => !v); setAddOpen(false); setThemeOpen(false); }}>
            <MessageSquare size={17} aria-hidden="true" />
          </button>
          <button className="btn icon" aria-label="Read the Google Sheets again" title="Read the Google Sheets again" aria-busy={syncing} disabled={syncing} onClick={resync}>
            <RefreshCw size={17} aria-hidden="true" className={syncing ? "spin" : undefined} />
          </button>
          <button className="btn icon" aria-label="Colours" title="Colours" aria-expanded={themeOpen} aria-haspopup="dialog" onClick={() => { setThemeOpen((v) => !v); setAddOpen(false); }}>
            <Palette size={17} aria-hidden="true" />
          </button>
          <button className="btn primary desk-only" aria-expanded={addOpen} aria-haspopup="menu" onClick={() => { setAddOpen((v) => !v); setThemeOpen(false); }}>
            <Plus size={18} aria-hidden="true" /> Add
          </button>
        </header>

        {(open || addOpen || themeOpen) && <div className="scrim" onClick={() => { setOpen(false); setAddOpen(false); setThemeOpen(false); }} />}
        {themeOpen && (
          <div className="addmenu themes" role="dialog" aria-label="Colours">
            <div className="menu-title">Colours</div>
            <div className="swatches" role="radiogroup" aria-label="Colour theme">
              {THEMES.map((t) => (
                <button key={t.id} type="button" className="swatch" role="radio" aria-checked={theme === t.id} onClick={() => chooseTheme(t.id)}>
                  <span className="chipset" aria-hidden="true">
                    <span style={{ background: t.bed }} /><span style={{ background: t.pane }} /><span style={{ background: t.plate }} />
                  </span>
                  <span>{t.name}{t.note ? <span className="muted" style={{ display: "block", textTransform: "none", letterSpacing: 0, fontFamily: "var(--font)", fontWeight: 400 }}>{t.note}</span> : null}</span>
                  {theme === t.id && <Check size={16} aria-hidden="true" style={{ marginLeft: "auto" }} />}
                </button>
              ))}
            </div>
          </div>
        )}
        {addOpen && (
          <div className="addmenu" role="menu" aria-label="Add">
            {ADD.map((a) => (
              <Link key={a.href} href={a.href} role="menuitem">
                <a.icon size={20} strokeWidth={1.8} aria-hidden="true" />
                <span><span className="l">{a.label}</span><span className="d">{a.desc}</span></span>
              </Link>
            ))}
          </div>
        )}

        <main className="page">{children}</main>
      </div>

      <ChatDock open={chatOpen} onClose={() => setChatOpen(false)} />
      <nav className="tabbar" aria-label="Main">
        {NAV.slice(0, 2).map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(pathname, n.href) ? "page" : undefined}>
            <n.icon size={21} aria-hidden="true" />{n.short ?? n.label}
          </Link>
        ))}
        <button className="plus" aria-label="Add" aria-expanded={addOpen} onClick={() => { setAddOpen((v) => !v); setThemeOpen(false); }}>
          <span className="disc"><Plus size={24} strokeWidth={2.4} aria-hidden="true" /></span>
        </button>
        {NAV.slice(2, 5).map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(pathname, n.href) ? "page" : undefined}>
            <n.icon size={21} aria-hidden="true" />{n.short ?? n.label}
            {n.count ? <span className="badge">{n.count}</span> : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
