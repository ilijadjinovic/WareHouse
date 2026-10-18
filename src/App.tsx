import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword,
  signInWithPopup, signOut, type User
} from "firebase/auth";
import { collection, doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";
import MasterPanel from "./MasterPanel";
import Workspace from "./Workspace";

type Profile = { companyId: string; role: string; active?: boolean; ime?: string };
type Company = { name: string; status: "pending" | "approved" | "rejected"; warehouses?: string[] };

function Shell({ children, user }: { children: React.ReactNode; user?: User | null }) {
  const { t, i18n } = useTranslation();
  const setLang = (l: string) => { localStorage.setItem("lang", l); i18n.changeLanguage(l); };
  return (
    <div className="shell">
      <header>
        <strong>{t("appName")}</strong>
        <div className="right">
          <select aria-label={t("language")} value={i18n.language} onChange={e => setLang(e.target.value)}>
            <option value="sr">Srpski</option><option value="en">English</option>
          </select>
          {user && <button className="ghost" onClick={() => signOut(auth)}>{t("logout")}</button>}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState("");
  const emailLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    try { await signInWithEmailAndPassword(auth, email, pw); } catch { setErr(t("errAuth")); }
  };
  const google = async () => {
    setErr("");
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch { setErr(t("errAuth")); }
  };
  return (
    <section className="card">
      <h1>{t("loginTitle")}</h1>
      <form onSubmit={emailLogin}>
        <label>{t("email")}<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>{t("password")}<input type="password" value={pw} onChange={e => setPw(e.target.value)} required /></label>
        <button type="submit">{t("loginEmail")}</button>
      </form>
      <p className="sep">{t("or")}</p>
      <button className="secondary" onClick={google}>{t("loginGoogle")}</button>
      <p className="hint">{t("googleHint")}</p>
      {err && <p className="err" role="alert">{err}</p>}
    </section>
  );
}

function InitCompany({ user, onDone }: { user: User; onDone: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(""); const [wh, setWh] = useState(""); const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    const warehouses = wh.split("\n").map(s => s.trim()).filter(Boolean);
    if (!name.trim() || warehouses.length === 0) { setErr(t("errCompany")); return; }
    try {
      const cref = doc(collection(db, "companies"));
      const batch = writeBatch(db);
      batch.set(cref, { name: name.trim(), ownerUid: user.uid, status: "pending", warehouses, createdAt: serverTimestamp() });
      batch.set(doc(db, "users", user.uid), { email: user.email ?? "", companyId: cref.id, role: "admin", active: true, ime: user.displayName ?? "" });
      await batch.commit(); onDone();
    } catch (e) { console.error(e); setErr(t("errSave")); }
  };
  return (
    <section className="card">
      <h1>{t("initTitle")}</h1>
      <p>{t("initIntro")}</p>
      <form onSubmit={submit}>
        <label>{t("companyName")}<input value={name} onChange={e => setName(e.target.value)} required /></label>
        <label>{t("warehouses")}<textarea rows={4} value={wh} onChange={e => setWh(e.target.value)} />
          <span className="hint">{t("warehousesHint")}</span></label>
        <button type="submit">{t("submitCompany")}</button>
      </form>
      {err && <p className="err" role="alert">{err}</p>}
    </section>
  );
}

export default function App() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(false);
  const [isMaster, setIsMaster] = useState(false);

  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setReady(true); }), []);

  const load = async (u: User) => {
    setLoading(true);
    const m = await getDoc(doc(db, "masters", u.uid));
    setIsMaster(m.exists());
    const p = await getDoc(doc(db, "users", u.uid));
    if (p.exists()) {
      const pr = p.data() as Profile; setProfile(pr);
      const c = await getDoc(doc(db, "companies", pr.companyId));
      setCompany(c.exists() ? (c.data() as Company) : null);
    } else { setProfile(null); setCompany(null); }
    setLoading(false);
  };
  useEffect(() => { if (user) load(user); else { setProfile(null); setCompany(null); setIsMaster(false); } }, [user]);

  if (!ready || loading) return <Shell user={user}><p>…</p></Shell>;
  if (!user) return <Shell><Login /></Shell>;
  if (isMaster) return <Shell user={user}><MasterPanel /></Shell>;
  if (!profile) return <Shell user={user}><InitCompany user={user} onDone={() => load(user)} /></Shell>;
  if (profile.active === false) return <Shell user={user}><p>{t("inactive")}</p></Shell>;
  if (!company) return <Shell user={user}><p>{t("noAccess")}</p></Shell>;
  if (company.status === "pending")
    return <Shell user={user}><section className="card"><h1>{t("pendingTitle")}</h1><p>{t("pendingText", { name: company.name })}</p></section></Shell>;
  if (company.status === "rejected")
    return <Shell user={user}><section className="card"><p>{t("rejectedText", { name: company.name })}</p></section></Shell>;
  return <Shell user={user}><Workspace companyId={profile.companyId} role={profile.role} company={company} me={{ uid: user.uid, name: profile.ime || user.displayName || user.email || "" }} /></Shell>;
}
