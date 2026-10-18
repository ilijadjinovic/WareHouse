import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, deleteDoc, doc, getDocs, runTransaction, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import ImportItems from "./ImportItems";

export type Item = { sifra: string; kategorija: string; naziv: string; jm: string; napomena: string };
const empty: Item = { sifra: "", kategorija: "", naziv: "", jm: "", napomena: "" };
export const validSifra = (s: string) => s.length > 0 && s.length <= 60 && !s.includes("/") && s !== "." && s !== ".." && !/^__.*__$/.test(s);

export default function Items({ companyId, role }: { companyId: string; role: string }) {
  const { t } = useTranslation();
  const canWrite = role === "admin" || role === "magacioner";
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState(""); const [cat, setCat] = useState("");
  const [form, setForm] = useState<Item | null>(null); const [isNew, setIsNew] = useState(true);
  const [err, setErr] = useState(""); const [showImport, setShowImport] = useState(false);

  const load = async () => {
    const snap = await getDocs(collection(db, "companies", companyId, "items"));
    setItems(snap.docs.map(d => d.data() as Item).sort((a, b) => a.sifra.localeCompare(b.sifra, undefined, { numeric: true })));
  };
  useEffect(() => { load(); }, [companyId]);

  const cats = useMemo(() => [...new Set(items.map(i => i.kategorija))].sort(), [items]);
  const units = useMemo(() => [...new Set(["kom", "kg", "m", "l", "set", "pak", ...items.map(i => i.jm)])], [items]);
  const shown = items.filter(i => (!cat || i.kategorija === cat) &&
    (!q || (i.sifra + " " + i.naziv).toLowerCase().includes(q.toLowerCase())));

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form) return; setErr("");
    const f = { sifra: form.sifra.trim(), kategorija: form.kategorija.trim(), naziv: form.naziv.trim(), jm: form.jm.trim(), napomena: form.napomena.trim() };
    if (!f.sifra || !f.kategorija || !f.naziv || !f.jm) { setErr(t("errFields")); return; }
    if (!validSifra(f.sifra)) { setErr(t("errSifra")); return; }
    const ref = doc(db, "companies", companyId, "items", f.sifra);
    try {
      if (isNew) {
        await runTransaction(db, async tx => {
          if ((await tx.get(ref)).exists()) throw new Error("dup");
          tx.set(ref, { ...f, createdAt: serverTimestamp() });
        });
      } else { await updateDoc(ref, { kategorija: f.kategorija, naziv: f.naziv, jm: f.jm, napomena: f.napomena }); }
      setForm(null); await load();
    } catch (ex) { console.error(ex); setErr((ex as Error).message === "dup" ? t("errDup") : t("errSave")); }
  };
  const remove = async (s: string) => {
    if (!confirm(t("confirmDelete"))) return;
    try { await deleteDoc(doc(db, "companies", companyId, "items", s)); await load(); } catch { setErr(t("errUpdate")); }
  };

  return (
    <section className="card wide">
      <h1>{t("itemsTitle")}</h1>
      <div className="toolbar">
        <input placeholder={t("search")} value={q} onChange={e => setQ(e.target.value)} />
        <select value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">{t("allCategories")}</option>{cats.map(c => <option key={c}>{c}</option>)}</select>
        {canWrite && <button onClick={() => { setForm(empty); setIsNew(true); setErr(""); }}>{t("addItem")}</button>}
        {canWrite && <button className="secondary" onClick={() => setShowImport(v => !v)}>{t("importExcel")}</button>}
      </div>
      {showImport && <ImportItems companyId={companyId} existing={new Set(items.map(i => i.sifra))} onDone={() => { load(); }} />}
      {form && (
        <form className="subform" onSubmit={save}>
          <h2>{isNew ? t("addItem") : t("editItem")}</h2>
          <label>{t("sifra")}<input value={form.sifra} disabled={!isNew} onChange={e => setForm({ ...form, sifra: e.target.value })} required /></label>
          <label>{t("kategorija")}<input list="cats" value={form.kategorija} onChange={e => setForm({ ...form, kategorija: e.target.value })} required /></label>
          <label>{t("naziv")}<input value={form.naziv} onChange={e => setForm({ ...form, naziv: e.target.value })} required /></label>
          <label>{t("jm")}<input list="units" value={form.jm} onChange={e => setForm({ ...form, jm: e.target.value })} required /></label>
          <label>{t("napomena")}<textarea rows={2} value={form.napomena} onChange={e => setForm({ ...form, napomena: e.target.value })} /></label>
          <datalist id="cats">{cats.map(c => <option key={c} value={c} />)}</datalist>
          <datalist id="units">{units.map(c => <option key={c} value={c} />)}</datalist>
          <div className="actions"><button type="submit">{t("save")}</button><button type="button" className="secondary" onClick={() => setForm(null)}>{t("cancel")}</button></div>
        </form>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      <p className="hint">{t("count")}: {shown.length}</p>
      {items.length === 0 ? <p>{t("noItems")}</p> : (
        <div className="scroll"><table>
          <thead><tr><th>{t("sifra")}</th><th>{t("kategorija")}</th><th>{t("naziv")}</th><th>{t("jm")}</th><th>{t("napomena")}</th><th></th></tr></thead>
          <tbody>{shown.map(i => (
            <tr key={i.sifra}><td>{i.sifra}</td><td>{i.kategorija}</td><td>{i.naziv}</td><td>{i.jm}</td><td>{i.napomena}</td>
              <td className="actions">
                {canWrite && <button className="ghost" onClick={() => { setForm(i); setIsNew(false); setErr(""); }}>{t("edit")}</button>}
                {(role === "admin" || role === "rukovodilac") && <button className="ghost danger" onClick={() => remove(i.sifra)}>{t("del")}</button>}
              </td></tr>))}</tbody></table></div>
      )}
    </section>
  );
}
