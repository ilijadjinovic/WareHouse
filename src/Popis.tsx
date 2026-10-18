import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import readXlsxFile from "read-excel-file";
import { doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import type { Item } from "./Items";
import { Fail, col, descendants, errText, gridKeys, loadItems, loadLocs, pathOf, post, stockId, today, type Loc, type Me, type Mov } from "./lib";

type PL = { sifra: string; locId: string; qty: string };
const N = (v: unknown) => String(v ?? "").trim();

export default function Popis({ companyId, role, me }: { companyId: string; role: string; me: Me }) {
  const { t } = useTranslation();
  const canWrite = role === "admin" || role === "magacioner";
  const [items, setItems] = useState<Map<string, Item>>(new Map()); const [locs, setLocs] = useState<Loc[]>([]);
  const [wid, setWid] = useState(""); const [datum, setDatum] = useState(today()); const [lines, setLines] = useState<PL[]>([]);
  const [status, setStatus] = useState<"none" | "draft" | "confirmed">("none"); const [doneDate, setDoneDate] = useState("");
  const [defLoc, setDefLoc] = useState(""); const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { (async () => { const [i, l] = await Promise.all([loadItems(companyId), loadLocs(companyId)]); setItems(i); setLocs(l); })(); }, [companyId]);

  const warehouses = locs.filter(l => l.type === "warehouse");
  const scopeOpts = useMemo(() => wid ? [...descendants(locs, wid)].map(id => ({ id, label: pathOf(locs, id) })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })) : [], [locs, wid]);

  const choose = async (id: string) => {
    setWid(id); setErr(""); setOk(""); setDefLoc(id); setStatus("none"); setLines(id ? [{ sifra: "", locId: id, qty: "" }] : []);
    if (!id) return;
    const s = await getDoc(doc(db, "companies", companyId, "popisi", id));
    if (s.exists()) {
      const d = s.data(); setStatus(d.status); setDoneDate(d.datum);
      if (d.status === "draft") { setDatum(d.datum); setLines((d.lines as PL[]).length ? d.lines : [{ sifra: "", locId: id, qty: "" }]); }
    }
  };
  const setLine = (i: number, p: Partial<PL>) => setLines(a => a.map((l, n) => n === i ? { ...l, ...p } : l));
  const addRow = () => setLines(a => [...a, { sifra: "", locId: a[a.length - 1]?.locId ?? defLoc, qty: "" }]);
  const fill = () => {
    const have = new Set(lines.filter(l => l.locId === defLoc).map(l => l.sifra));
    const add = [...items.values()].sort((a, b) => a.sifra.localeCompare(b.sifra, undefined, { numeric: true })).filter(i => !have.has(i.sifra)).map(i => ({ sifra: i.sifra, locId: defLoc, qty: "" }));
    setLines(a => [...a.filter(l => l.sifra || l.qty), ...add]);
  };

  const saveDraft = async () => {
    setErr(""); setOk("");
    try {
      await setDoc(doc(db, "companies", companyId, "popisi", wid), { warehouseId: wid, datum, status: "draft", lines: lines.filter(l => l.sifra || l.qty), updatedAt: serverTimestamp() });
      setStatus("draft"); setOk(t("draftSaved"));
    } catch (ex) { setErr(errText(t, ex)); }
  };
  const confirmPopis = async () => {
    setErr(""); setOk(""); setBusy(true);
    try {
      if (datum > today()) throw new Fail("errFuture");
      const allowed = descendants(locs, wid); const seen = new Set<string>(); const rows: { sifra: string; locId: string; q: number }[] = [];
      lines.forEach((l, i) => {
        if (!l.sifra.trim() && !l.qty.trim()) return; if (l.qty.trim() === "") return;
        const s = l.sifra.trim();
        if (!items.has(s) || !allowed.has(l.locId) || !/^\d+$/.test(l.qty.trim())) throw new Fail("errLine", { n: i + 1 });
        const k = stockId(l.locId, s); if (seen.has(k)) throw new Fail("errDupLine", { n: i + 1 }); seen.add(k);
        rows.push({ sifra: s, locId: l.locId, q: Number(l.qty) });
      });
      const posted = await getDocs(query(col(companyId, "movements"), where("popisId", "==", wid)));
      const done = new Set(posted.docs.map(d => stockId(d.data().locId, d.data().sifra)));
      const todo: Mov[] = rows.filter(r => r.q > 0 && !done.has(stockId(r.locId, r.sifra)))
        .map(r => ({ sifra: r.sifra, locId: r.locId, delta: r.q, datum, type: "popis", extra: { popisId: wid, warehouseId: wid } }));
      for (let i = 0; i < todo.length; i += 150) await post(companyId, todo.slice(i, i + 150), me);
      await setDoc(doc(db, "companies", companyId, "popisi", wid), { warehouseId: wid, datum, status: "confirmed", lines: lines.filter(l => l.sifra || l.qty), confirmedBy: me.name, confirmedAt: serverTimestamp() });
      setStatus("confirmed"); setDoneDate(datum); setOk(t("popisDone"));
    } catch (ex) { setErr(errText(t, ex)); }
    setBusy(false);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return; setErr("");
    try {
      const data = await readXlsxFile(f); const head = (data[0] ?? []).map(h => N(h).toUpperCase());
      const iS = head.findIndex(h => ["ŠIFRA", "SIFRA"].includes(h)); const iQ = head.findIndex(h => ["KOLIČINA", "KOLICINA", "STANJE"].includes(h));
      const iL = head.findIndex(h => ["LOKACIJA", "POZICIJA", "PODMAGACIN"].includes(h));
      if (iS < 0 || iQ < 0) throw new Fail("errLine", { n: 1 });
      const scopeLocs = locs.filter(l => descendants(locs, wid).has(l.id)); const add: PL[] = [];
      data.slice(1).forEach((r, n) => {
        if (r.every(c => N(c) === "")) return;
        let locId = wid; if (iL >= 0 && N(r[iL])) { const m = scopeLocs.filter(l => l.name.toLowerCase() === N(r[iL]).toLowerCase()); if (m.length !== 1) throw new Fail("errLine", { n: n + 2 }); locId = m[0].id; }
        add.push({ sifra: N(r[iS]), locId, qty: N(r[iQ]) });
      });
      setLines(a => [...a.filter(l => l.sifra || l.qty), ...add]);
    } catch (ex) { setErr(errText(t, ex)); }
    e.target.value = "";
  };

  return (
    <section className="panel">
      <label>{t("selectWarehouse")}<select value={wid} onChange={e => choose(e.target.value)}><option value="">—</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      {wid && status === "confirmed" && <p>{t("popisExists", { d: doneDate })}</p>}
      {wid && status !== "confirmed" && canWrite && <>
        <div className="hdr">
          <label>{t("popisDatum")}<input type="date" max={today()} value={datum} onChange={e => setDatum(e.target.value)} /></label>
          <label>{t("defLoc")}<select value={defLoc} onChange={e => setDefLoc(e.target.value)}>{scopeOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        </div>
        <p className="hint">{t("popisHelp")}</p>
        <div className="toolbar">
          <button type="button" className="secondary" onClick={fill}>{t("fillCatalog")}</button>
          <label className="inline hint">{t("popisImportHelp")}<input type="file" accept=".xlsx" onChange={onFile} /></label>
        </div>
        <datalist id="dl-items">{[...items.values()].map(i => <option key={i.sifra} value={i.sifra}>{i.naziv}</option>)}</datalist>
        <div className="table-wrap" onKeyDown={gridKeys(addRow)}>
          <table className="data-table grid"><thead><tr><th>{t("sifra")}</th><th>{t("naziv")}</th><th>{t("lokacija")}</th><th>{t("kolicina")}</th><th></th></tr></thead>
            <tbody>{lines.map((l, i) => { const it = items.get(l.sifra.trim()); return (
              <tr key={i}>
                <td><input list="dl-items" value={l.sifra} onChange={e => setLine(i, { sifra: e.target.value })} /></td>
                <td className="nm">{it ? `${it.naziv} (${it.jm})` : ""}</td>
                <td><select value={l.locId} onChange={e => setLine(i, { locId: e.target.value })}>{scopeOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></td>
                <td><input className="num" type="number" min={0} step={1} value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} /></td>
                <td><button type="button" tabIndex={-1} className="ghost" onClick={() => setLines(a => a.filter((_, n) => n !== i))}>×</button></td>
              </tr>); })}</tbody></table>
        </div>
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="secondary" onClick={addRow}>{t("addRow")}</button>
          <button type="button" className="secondary" onClick={saveDraft}>{t("saveDraft")}</button>
          <button type="button" disabled={busy} onClick={confirmPopis}>{t("confirmPopis")}</button>
        </div>
      </>}
      {err && <p className="err" role="alert">{err}</p>}{ok && <p className="ok" role="status">{ok}</p>}
    </section>
  );
}
