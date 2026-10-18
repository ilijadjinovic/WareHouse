import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { initializeApp, deleteApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { auth, db, firebaseConfig } from "./firebase";

type U = { id: string; email: string; ime?: string; role: string; active: boolean };
const ROLES = ["admin", "rukovodilac", "magacioner"];

export default function UsersAdmin({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<U[]>([]);
  const [ime, setIme] = useState(""); const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [role, setRole] = useState("magacioner");
  const [err, setErr] = useState("");

  const load = async () => {
    const snap = await getDocs(query(collection(db, "users"), where("companyId", "==", companyId)));
    setUsers(snap.docs.map(d => { const x = d.data() as Omit<U, "id">; return { ...x, id: d.id, active: x.active !== false }; }));
  };
  useEffect(() => { load(); }, [companyId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    // Drugi (privremeni) Firebase klijent: kreira nalog bez odjave admina.
    const second = initializeApp(firebaseConfig, "secondary-" + Date.now());
    try {
      const sa = getAuth(second);
      const cred = await createUserWithEmailAndPassword(sa, email.trim(), pw);
      await setDoc(doc(db, "users", cred.user.uid), { email: email.trim(), companyId, role, active: true, ime: ime.trim() });
      await signOut(sa);
      setIme(""); setEmail(""); setPw(""); await load();
    } catch { setErr(t("errUser")); }
    finally { await deleteApp(second); }
  };
  const patch = async (id: string, data: Partial<U>) => {
    setErr("");
    try { await updateDoc(doc(db, "users", id), data); await load(); } catch { setErr(t("errUpdate")); }
  };

  return (
    <section className="panel">
      {users.map(u => (
        <div className="row" key={u.id}>
          <div>{u.ime ? u.ime + " · " : ""}{u.email}</div>
          <div className="actions">
            <select aria-label={t("role")} value={u.role} disabled={u.id === auth.currentUser?.uid}
              onChange={e => patch(u.id, { role: e.target.value })}>
              {ROLES.map(r => <option key={r} value={r}>{t("role_" + r)}</option>)}
            </select>
            <label className="inline"><input type="checkbox" checked={u.active} disabled={u.id === auth.currentUser?.uid}
              onChange={e => patch(u.id, { active: e.target.checked })} />{t("active")}</label>
          </div>
        </div>
      ))}
      <h2>{t("addUser")}</h2>
      <form onSubmit={add}>
        <label>{t("ime")}<input value={ime} onChange={e => setIme(e.target.value)} required /></label>
        <label>{t("email")}<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>{t("password")}<input type="password" minLength={6} placeholder={t("passwordHint")} value={pw} onChange={e => setPw(e.target.value)} required /></label>
        <label>{t("role")}<select value={role} onChange={e => setRole(e.target.value)}>
          {ROLES.map(r => <option key={r} value={r}>{t("role_" + r)}</option>)}</select></label>
        <button type="submit">{t("addUser")}</button>
      </form>
      {err && <p className="err" role="alert">{err}</p>}
    </section>
  );
}
