import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, type User } from "firebase/auth";
import { collection, doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db } from "./firebase";
import { AuthBox, Shell } from "./Shell";
import MasterPanel from "./MasterPanel";
import Workspace from "./Workspace";

type Profile = { companyId: string; role: string; active?: boolean; ime?: string };
type Company = { name: string; status: "pending" | "approved" | "rejected"; warehouses?: string[] };

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
    <>
      <h2>{t("loginTitle")}</h2>
      <form onSubmit={emailLogin}>
        <label>{t("email")}<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>{t("password")}<input type="password" value={pw} onChange={e => setPw(e.target.value)} required /></label>
        <button type="submit">{t("loginEmail")}</button>
      </form>
      <p className="sep">{t("or")}</p>
      <button className="secondary" onClick={google}>{t("loginGoogle")}</button>
      <p className="hint">{t("googleHint")}</p>
      {err && <p className="err" role="alert">{err}</p>}
    </>
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
    <>
      <h2>{t("initTitle")}</h2>
      <p>{t("initIntro")}</p>
      <form onSubmit={submit}>
        <label>{t("companyName")}<input value={name} onChange={e => setName(e.target.value)} required /></label>
        <label>{t("warehouses")}<textarea rows={4} value={wh} onChange={e => setWh(e.target.value)} />
          <span className="hint">{t("warehousesHint")}</span></label>
        <button type="submit">{t("submitCompany")}</button>
      </form>
      {err && <p className="err" role="alert">{err}</p>}
    </>
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

  if (!ready || loading) return <AuthBox><p>…</p></AuthBox>;
  if (!user) return <AuthBox><Login /></AuthBox>;
  if (isMaster) return (
    <Shell menu={[{ key: "m", icon: "🛡️", label: t("masterTitle") }]} active="m" onSelect={() => {}} title={t("masterTitle")}
      name={user.displayName || user.email || ""} pill="Master admin"><MasterPanel /></Shell>);
  if (!profile) return <AuthBox wide logout><InitCompany user={user} onDone={() => load(user)} /></AuthBox>;
  if (profile.active === false) return <AuthBox logout><p>{t("inactive")}</p></AuthBox>;
  if (!company) return <AuthBox logout><p>{t("noAccess")}</p></AuthBox>;
  if (company.status === "pending") return <AuthBox logout><h2>{t("pendingTitle")}</h2><p>{t("pendingText", { name: company.name })}</p></AuthBox>;
  if (company.status === "rejected") return <AuthBox logout><p>{t("rejectedText", { name: company.name })}</p></AuthBox>;
  return <Workspace companyId={profile.companyId} role={profile.role} company={company}
    me={{ uid: user.uid, name: profile.ime || user.displayName || user.email || "" }} />;
}
