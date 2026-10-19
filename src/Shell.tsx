import { useState } from "react";
import { useTranslation } from "react-i18next";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import About from "./About";
import logo from "./assets/logo.png";

export function LangSwitch() {
  const { i18n } = useTranslation();
  const set = (l: string) => { localStorage.setItem("lang", l); i18n.changeLanguage(l); };
  return (
    <div className="lang-toggle">
      {["sr", "en"].map(l => <button key={l} className={"lang-option" + (i18n.language === l ? " active" : "")} onClick={() => set(l)}>{l.toUpperCase()}</button>)}
    </div>
  );
}

export function AuthBox({ wide, logout, children }: { wide?: boolean; logout?: boolean; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="auth-shell">
      <div className="auth-lang"><LangSwitch /></div>
      <div className={"auth-card" + (wide ? " wide" : "")}>
        <div className="auth-logo"><img className="brand-mark" src={logo} alt="" /><span className="brand-name">{t("appName")}</span></div>
        {children}
        {logout && <p className="auth-foot"><a href="#" onClick={e => { e.preventDefault(); signOut(auth); }}>{t("logout")}</a></p>}
      </div>
    </div>
  );
}

export type MenuItem = { key: string; icon: string; label: string; badge?: number };

export function Shell({ menu, active, onSelect, eyebrow, title, name, pill, onProfile, banner, children }: {
  menu: MenuItem[]; active: string; onSelect: (k: string) => void; eyebrow?: string; title: string; name: string; pill: string; onProfile?: () => void; banner?: React.ReactNode; children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState(false);
  return (
    <div className="app-shell">
      <div className={"sidebar-backdrop" + (open ? " show" : "")} onClick={() => setOpen(false)} />
      <aside className={"sidebar" + (open ? " open" : "")}>
        <div className="brand"><img className="brand-mark" src={logo} alt="" /><span className="brand-name">{t("appName")}</span></div>
        <nav className="side-menu">
          {menu.map(m => (
            <a key={m.key} href="#" className={"side-link" + (m.key === active ? " active" : "")}
              onClick={e => { e.preventDefault(); onSelect(m.key); setOpen(false); }}>
              <span className="side-icon">{m.icon}</span>{m.label}
              {!!m.badge && <span className="badge badge-red" style={{ marginLeft: "auto" }}>{m.badge}</span>}
            </a>))}
        </nav>
        <div className="side-footer">
          <hr className="about-sep" style={{ marginBottom: 10 }} />
          <a href="#" className="side-link" style={{ marginBottom: 12 }} onClick={e => { e.preventDefault(); setAbout(true); }}><span className="side-icon">ℹ️</span>{t("aboutTitle")}</a>
          <span className="role-pill">{pill}</span>
        </div>
      </aside>
      <header className="topbar">
        <button id="menu-toggle" className="icon-btn" aria-label="Menu" onClick={() => setOpen(o => !o)}>☰</button>
        <div className="topbar-spacer" />
        <LangSwitch />
        <button type="button" className="user-chip" onClick={onProfile} title={t("nav_profile")}><div className="user-avatar">{(name || "?")[0].toUpperCase()}</div><span className="user-name">{name}</span></button>
        <button id="logout-btn" className="btn btn-outline btn-sm" onClick={() => signOut(auth)}>
          <span className="logout-icon">⎋</span><span className="logout-label">{t("logout")}</span></button>
      </header>
      <main className="content">
        <div className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1></div></div>
        {banner}
        {children}
      </main>
      {about && <About onClose={() => setAbout(false)} />}
    </div>
  );
}
