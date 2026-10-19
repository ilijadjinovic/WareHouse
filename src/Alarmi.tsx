import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { Alarm } from "./alarms";
import type { Item } from "./Items";
import { Fail, errText, loadItems, loadLocs, pathOf, type Loc } from "./lib";

export default function Alarmi({ companyId, role, alarms, reload }: { companyId: string; role: string; alarms: Alarm[]; reload: () => void }) {
  const { t } = useTranslation();
  const canWrite = role === "admin" || role === "magacioner";
  const [items, setItems] = useState<Map<string, Item>>(new Map()); const [locs, setLocs] = useState<Loc[]>([]);
  const [f, setF] = useState({ sifra: "", locId: "", prag: "" }); const [err, setErr] = useState("");
  const cleared = useRef(false);
  useEffect(() => { (async () => { const [i, l] = await Promise.all([loadItems(companyId), loadLocs(companyId)]); setItems(i); setLocs(l); })(); }, [companyId]);

  // Kad stanje pređe minimum, oznaka "nabavka pokrenuta" se sama skida.
  useEffect(() => {
    const stale = alarms.filter(a => a.nabavka && !a.low);
    if (!canWrite || cleared.current || stale.length === 0) return;
    cleared.current = true;
    Promise.all(stale.map(a => updateDoc(doc(db, "companies", companyId, "triggers", a.id), { nabavka: false }))).then(reload).catch(e => console.warn(e));
  }, [alarms]);

  const opts = useMemo(() => locs.filter(l => l.type !== "pos").map(l => ({ id: l.id, label: pathOf(locs, l.id) })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), [locs]);
  const rows = [...alarms].sort((a, b) => Number(b.low) - Number(a.low) || a.sifra.localeCompare(b.sifra, undefined, { numeric: true }));
  const ref = (id: string) => doc(db, "companies", companyId, "triggers", id);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    try {
      const s = f.sifra.trim();
      if (!items.has(s)) throw new Fail("errNoItem", { s });
      if (!f.locId) throw new Fail("errLoc");
      if (!/^\d+$/.test(f.prag.trim())) throw new Fail("errMin");
      await setDoc(ref(`${f.locId}_${s}`), { sifra: s, locId: f.locId, prag: Number(f.prag), nabavka: false, createdAt: serverTimestamp() });
      setF({ sifra: "", locId: f.locId, prag: "" }); reload();
    } catch (ex) { setErr(errText(t, ex)); }
  };
  const act = async (fn: () => Promise<unknown>) => { setErr(""); try { await fn(); reload(); } catch (ex) { setErr(errText(t, ex)); } };
  const editMin = (a: Alarm) => {
    const v = (prompt(t("trMin"), String(a.prag)) ?? "").trim(); if (!v) return;
    if (!/^\d+$/.test(v)) { setErr(t("errMin")); return; }
    act(() => updateDoc(ref(a.id), { prag: Number(v) }));
  };

  return (
    <section className="panel">
      <p className="hint">{t("alHint")}</p>
      <div className="toolbar"><button type="button" className="secondary" onClick={reload}>{t("refresh")}</button></div>
      {canWrite && (
        <form className="subform" onSubmit={add}>
          <h2>{t("trAdd")}</h2>
          <datalist id="dl-items">{[...items.values()].map(i => <option key={i.sifra} value={i.sifra}>{i.naziv}</option>)}</datalist>
          <div className="hdr">
            <label>{t("sifra")}<input list="dl-items" value={f.sifra} onChange={e => setF({ ...f, sifra: e.target.value })} required /></label>
            <label>{t("trLoc")}<select value={f.locId} onChange={e => setF({ ...f, locId: e.target.value })} required><option value="">—</option>
              {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
            <label>{t("trMin")}<input type="number" min={0} step={1} value={f.prag} onChange={e => setF({ ...f, prag: e.target.value })} required /></label>
          </div>
          <button type="submit">{t("trAdd")}</button>
        </form>)}
      {err && <p className="err" role="alert">{err}</p>}
      {rows.length === 0 ? <p className="muted">{t("alNone")}</p> : (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>{t("sifra")}</th><th>{t("naziv")}</th><th>{t("lokacija")}</th><th>{t("trStock")}</th><th>{t("trMin")}</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map(a => { const it = items.get(a.sifra);
            const st = !a.low ? ["badge-green", t("alOk")] : a.nabavka ? ["badge-amber", t("alOrdered")] : ["badge-red", t("alLow")];
            return (
              <tr key={a.id}>
                <td>{a.sifra}</td><td className="wrap-col">{it?.naziv}</td><td>{pathOf(locs, a.locId)}</td>
                <td><strong>{a.stanje}</strong> {it?.jm}</td><td>{a.prag}</td>
                <td><span className={"badge " + st[0]}>{st[1]}</span></td>
                <td><div className="actions">
                  {canWrite && a.low && !a.nabavka && <button type="button" onClick={() => act(() => updateDoc(ref(a.id), { nabavka: true }))}>{t("alMark")}</button>}
                  {canWrite && a.low && a.nabavka && <button type="button" className="secondary" onClick={() => act(() => updateDoc(ref(a.id), { nabavka: false }))}>{t("alUnmark")}</button>}
                  {canWrite && <button type="button" className="ghost" onClick={() => editMin(a)}>{t("edit")}</button>}
                  {role === "admin" && <button type="button" className="ghost danger" onClick={() => { if (confirm(t("confirmDelete"))) act(() => deleteDoc(ref(a.id))); }}>{t("del")}</button>}
                </div></td>
              </tr>); })}</tbody></table></div>)}
    </section>
  );
}
