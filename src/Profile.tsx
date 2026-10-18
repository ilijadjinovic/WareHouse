import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, updatePassword, type User } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export const COMPANY_FIELDS = ["punNaziv", "pib", "maticni", "adresa", "postanski", "mesto", "drzava", "telefon", "email", "web", "kontakt", "racun", "napomena"] as const;
export type CompanyField = typeof COMPANY_FIELDS[number];
export type CompanyDoc = { name: string; warehouses?: string[] } & Partial<Record<CompanyField, string>>;

export const fullName = (p: { ime?: string; prezime?: string }) => [p.ime, p.prezime].filter(Boolean).join(" ").trim();

type Props = {
  user: User; kind: "master" | "member"; role?: string; companyId?: string; company?: CompanyDoc; onChanged: () => void;
};

export default function Profile({ user, kind, role, companyId, company, onChanged }: Props) {
  const { t } = useTranslation();
  const isAdmin = kind === "member" && role === "admin";
  const [tab, setTab] = useState<"personal" | "password" | "company">("personal");
  return (
    <section className="panel">
      {kind === "member" && (
        <div className="tabs">
          <button type="button" className={"tab-btn" + (tab === "personal" ? " active" : "")} onClick={() => setTab("personal")}>{t("tab_personal")}</button>
          <button type="button" className={"tab-btn" + (tab === "password" ? " active" : "")} onClick={() => setTab("password")}>{t("tab_password")}</button>
          {isAdmin && <button type="button" className={"tab-btn" + (tab === "company" ? " active" : "")} onClick={() => setTab("company")}>{t("tab_company")}</button>}
        </div>
      )}
      {tab === "personal" && <PersonalTab user={user} kind={kind} role={role} onChanged={onChanged} />}
      {kind === "member" && tab === "password" && <PasswordTab user={user} />}
      {isAdmin && tab === "company" && companyId && company && <CompanyTab companyId={companyId} company={company} onChanged={onChanged} />}
    </section>
  );
}

function PersonalTab({ user, kind, role, onChanged }: { user: User; kind: "master" | "member"; role?: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const ref = doc(db, kind === "master" ? "masters" : "users", user.uid);
  const [f, setF] = useState({ ime: "", prezime: "", telefon: "", pozicija: "" });
  const [ready, setReady] = useState(false); const [err, setErr] = useState(""); const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      const d = (await getDoc(ref)).data() as Record<string, string> | undefined;
      let ime = d?.ime || user.displayName || ""; let prezime = d?.prezime || "";
      // Stari zapisi čuvaju „Ime Prezime“ u jednom polju: razdvoji samo za prikaz u formi.
      if (!prezime && ime.includes(" ")) { const i = ime.lastIndexOf(" "); prezime = ime.slice(i + 1); ime = ime.slice(0, i); }
      setF({ ime, prezime, telefon: d?.telefon || "", pozicija: d?.pozicija || "" }); setReady(true);
    })();
  }, [user.uid]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setOk(false); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setOk(false);
    const v = { ime: f.ime.trim(), prezime: f.prezime.trim(), telefon: f.telefon.trim(), pozicija: f.pozicija.trim() };
    if (!v.ime) { setErr(t("errIme")); return; }
    try { await updateDoc(ref, v); setOk(true); onChanged(); } catch (ex) { console.error(ex); setErr(t("errSave")); }
  };
  if (!ready) return <p>…</p>;
  return (
    <form onSubmit={save}>
      <div className="hdr">
        <label>{t("firstName")}<input value={f.ime} maxLength={80} onChange={set("ime")} required /></label>
        <label>{t("lastName")}<input value={f.prezime} maxLength={80} onChange={set("prezime")} /></label>
        <label>{t("telefon")}<input type="tel" value={f.telefon} maxLength={80} onChange={set("telefon")} /></label>
        <label>{t("pozicija")}<input value={f.pozicija} maxLength={80} onChange={set("pozicija")} /></label>
        <label>{t("email")}<input type="email" value={user.email ?? ""} disabled /></label>
        {role && <label>{t("role")}<input value={t("role_" + role)} disabled /></label>}
      </div>
      <div className="actions"><button type="submit">{t("save")}</button></div>
      {ok && <p className="ok" role="status">{t("profileSaved")}</p>}
      {err && <p className="err" role="alert">{err}</p>}
    </form>
  );
}

function PasswordTab({ user }: { user: User }) {
  const { t } = useTranslation();
  const hasPw = user.providerData.some(p => p.providerId === "password");
  const [cur, setCur] = useState(""); const [n1, setN1] = useState(""); const [n2, setN2] = useState("");
  const [err, setErr] = useState(""); const [ok, setOk] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setOk("");
    if (n1.length < 8) { setErr(t("errPwWeak")); return; }
    if (n1 !== n2) { setErr(t("errPwMatch")); return; }
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? "", cur));
      await updatePassword(user, n1);
      setCur(""); setN1(""); setN2(""); setOk(t("pwChanged"));
    } catch (ex) {
      const code = (ex as { code?: string }).code ?? "";
      if (["auth/wrong-password", "auth/invalid-credential", "auth/invalid-login-credentials"].includes(code)) setErr(t("errPwWrong"));
      else if (code === "auth/weak-password") setErr(t("errPwWeak"));
      else if (code === "auth/too-many-requests") setErr(t("errTooMany"));
      else { console.error(ex); setErr(t("errSave")); }
    }
  };
  const sendLink = async () => {
    setErr(""); setOk("");
    try { await sendPasswordResetEmail(auth, user.email ?? ""); setOk(t("pwLinkSent", { email: user.email })); } catch (ex) { console.error(ex); setErr(t("errReset")); }
  };

  if (!hasPw) return (
    <div>
      <p>{t("googleAccountPw")}</p>
      <div className="actions"><button type="button" onClick={sendLink}>{t("sendPwLink")}</button></div>
      {ok && <p className="ok" role="status">{ok}</p>}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
  return (
    <form onSubmit={submit}>
      <div className="hdr">
        <label>{t("currentPassword")}<input type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} required /></label>
        <label>{t("newPassword")}<input type="password" autoComplete="new-password" value={n1} onChange={e => setN1(e.target.value)} required /></label>
        <label>{t("repeatPassword")}<input type="password" autoComplete="new-password" value={n2} onChange={e => setN2(e.target.value)} required /></label>
      </div>
      <div className="actions"><button type="submit">{t("changePassword")}</button></div>
      {ok && <p className="ok" role="status">{ok}</p>}
      {err && <p className="err" role="alert">{err}</p>}
    </form>
  );
}

function CompanyTab({ companyId, company, onChanged }: { companyId: string; company: CompanyDoc; onChanged: () => void }) {
  const { t } = useTranslation();
  const init = () => ({ name: company.name, ...Object.fromEntries(COMPANY_FIELDS.map(k => [k, company[k] ?? (k === "drzava" ? "Srbija" : "")])) } as Record<string, string>);
  const [f, setF] = useState<Record<string, string>>(init);
  const [err, setErr] = useState(""); const [ok, setOk] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setOk(false); };
  const inp = (k: string, type = "text") => <label key={k}>{t(k === "name" ? "companyName" : "c_" + k)}<input type={type} value={f[k]} maxLength={200} onChange={set(k)} required={k === "name"} /></label>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setOk(false);
    const v = Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.trim()]));
    if (!v.name) { setErr(t("errCompanyName")); return; }
    try { await updateDoc(doc(db, "companies", companyId), v); setOk(true); onChanged(); } catch (ex) { console.error(ex); setErr(t("errSave")); }
  };
  return (
    <form onSubmit={save}>
      <h2>{t("sec_basic")}</h2>
      <div className="hdr">{inp("name")}{inp("punNaziv")}{inp("pib")}{inp("maticni")}</div>
      <h2>{t("sec_contact")}</h2>
      <div className="hdr">{inp("adresa")}{inp("postanski")}{inp("mesto")}{inp("drzava")}{inp("telefon", "tel")}{inp("email", "email")}{inp("web")}{inp("kontakt")}</div>
      <h2>{t("sec_other")}</h2>
      <div className="hdr">{inp("racun")}</div>
      <label>{t("c_napomena")}<textarea rows={3} maxLength={500} value={f.napomena} onChange={set("napomena")} /></label>
      <div className="actions"><button type="submit">{t("saveCompany")}</button></div>
      {ok && <p className="ok" role="status">{t("profileSaved")}</p>}
      {err && <p className="err" role="alert">{err}</p>}
    </form>
  );
}
