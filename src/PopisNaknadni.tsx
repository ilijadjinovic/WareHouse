import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import type { Item } from "./Items";
import { Fail, checkHistory, col, descendants, errText, gridKeys, loadStock, pathOf, post, stockId, today, type Loc, type Me, type Mov } from "./lib";

type PL = { sifra: string; locId: string; qty: string };
type Past = { id: string; datum: string; status: string; confirmedBy?: string; lines?: PL[] };

/** Naknadni popis: popisano stanje na KRAJ izabranog dana se poredi sa stanjem po sistemu, a razlika se knjiži kao korekcija. */
export default function PopisNaknadni({ companyId, wid, locs, items, me, canWrite }: {
  companyId: string; wid: string; locs: Loc[]; items: Map<string, Item>; me: Me; canWrite: boolean;
}) {
  const { t } = useTranslation();
  const [datum, setDatum] = useState(today());
  const [lines, setLines] = useState<PL[]>([{ sifra: "", locId: wid, qty: "" }]);
  const [exp, setExp] = useState<Map<string, number>>(new Map());
  const [past, setPast] = useState<Past[]>([]);
  const [draftId, setDraftId] = useState("");
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);

  const scope = useMemo(() => descendants(locs, wid), [locs, wid]);
  const scopeOpts = useMemo(() => [...scope].map(id => ({ id, label: pathOf(locs, id) })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), [scope, locs]);
  const confirmed = past.filter(p => p.status === "confirmed").sort((a, b) => b.datum.localeCompare(a.datum));
  const lastDate = confirmed[0]?.datum ?? "";

  const loadPast = async () => {
    const s = await getDocs(query(col(companyId, "popisi"), where("warehouseId", "==", wid)));
    const all = s.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Past, "id">) }));
    setPast(all);
    return all;
  };
  useEffect(() => {
    (async () => {
      const all = await loadPast();
      const dr = all.find(p => p.status === "draft" && p.id !== wid);
      if (dr) { setDraftId(dr.id); setDatum(dr.datum); if (dr.lines?.length) setLines(dr.lines); }
    })();
  }, [wid]);

  // Stanje po sistemu na kraju izabranog dana = trenutno stanje minus kretanja posle tog dana.
  useEffect(() => {
    let dead = false;
    (async () => {
      const [stock, later] = await Promise.all([loadStock(companyId), getDocs(query(col(companyId, "movements"), where("datum", ">", datum)))]);
      const m = new Map<string, number>();
      stock.forEach((v, k) => { if (scope.has(v.locId)) m.set(k, v.qty); });
      later.docs.forEach(d => { const x = d.data() as { locId: string; sifra: string; delta: number }; if (!scope.has(x.locId)) return; const k = stockId(x.locId, x.sifra); m.set(k, (m.get(k) ?? 0) - x.delta); });
      if (!dead) setExp(m);
    })();
    return () => { dead = true; };
  }, [companyId, datum, scope]);

  const setLine = (i: number, p: Partial<PL>) => setLines(a => a.map((l, n) => n === i ? { ...l, ...p } : l));
  const addRow = () => setLines(a => [...a, { sifra: "", locId: a[a.length - 1]?.locId ?? wid, qty: "" }]);
  const fillStock = () => {
    const have = new Set(lines.map(l => stockId(l.locId, l.sifra.trim())));
    const add: PL[] = [...exp.entries()].filter(([k, q]) => q > 0 && !have.has(k))
      .map(([k]) => { const i = k.indexOf("_"); return { sifra: k.slice(i + 1), locId: k.slice(0, i), qty: "" }; })
      .sort((a, b) => a.sifra.localeCompare(b.sifra, undefined, { numeric: true }));
    setLines(a => [...a.filter(l => l.sifra || l.qty), ...add]);
  };
  const diffOf = (l: PL) => l.qty.trim() === "" || !/^\d+$/.test(l.qty.trim()) ? null : Number(l.qty) - (exp.get(stockId(l.locId, l.sifra.trim())) ?? 0);

  const saveDraft = async () => {
    setErr(""); setOk("");
    try {
      const id = draftId || `${wid}_${Date.now()}`;
      await setDoc(doc(db, "companies", companyId, "popisi", id), { warehouseId: wid, datum, status: "draft", lines: lines.filter(l => l.sifra || l.qty), updatedAt: serverTimestamp() });
      setDraftId(id); setOk(t("draftSaved")); await loadPast();
    } catch (ex) { setErr(errText(t, ex)); }
  };

  const confirmPopis = async () => {
    setErr(""); setOk(""); setBusy(true);
    try {
      if (datum > today()) throw new Fail("errFuture");
      if (lastDate && datum <= lastDate) throw new Fail("errAfterLast", { d: lastDate });
      const seen = new Set<string>(); const todo: Mov[] = [];
      const id = draftId || `${wid}_${Date.now()}`;
      lines.forEach((l, i) => {
        if (l.qty.trim() === "") return;
        const s = l.sifra.trim();
        if (!items.has(s) || !scope.has(l.locId) || !/^\d+$/.test(l.qty.trim())) throw new Fail("errLine", { n: i + 1 });
        const k = stockId(l.locId, s); if (seen.has(k)) throw new Fail("errDupLine", { n: i + 1 }); seen.add(k);
        const d = Number(l.qty) - (exp.get(k) ?? 0);
        if (d !== 0) todo.push({ sifra: s, locId: l.locId, delta: d, datum, type: "popis", extra: { popisId: id, warehouseId: wid } });
      });
      if (!confirm(t("confirmNak", { n: todo.length }))) { setBusy(false); return; }
      const h = await checkHistory(companyId, todo); if (h) throw new Fail("errHistory", { s: h.sifra, d: h.datum });
      for (let i = 0; i < todo.length; i += 150) await post(companyId, todo.slice(i, i + 150), me);
      await setDoc(doc(db, "companies", companyId, "popisi", id), { warehouseId: wid, datum, status: "confirmed", lines: lines.filter(l => l.sifra || l.qty), confirmedBy: me.name, confirmedAt: serverTimestamp() });
      setDraftId(""); setLines([{ sifra: "", locId: wid, qty: "" }]); setOk(t("popisDone")); await loadPast();
      const st = await loadStock(companyId); const m = new Map<string, number>(); st.forEach((v, k) => { if (scope.has(v.locId)) m.set(k, v.qty); }); setExp(m);
    } catch (ex) { setErr(errText(t, ex)); }
    setBusy(false);
  };

  return (
    <>
      <h2>{t("popisNak")}</h2>
      {canWrite && <>
        <div className="hdr">
          <label>{t("popisDatum")}<input type="date" max={today()} min={lastDate || undefined} value={datum} onChange={e => setDatum(e.target.value)} /></label>
        </div>
        <p className="hint">{t("popisNakHelp")}</p>
        <div className="toolbar"><button type="button" className="secondary" onClick={fillStock}>{t("fillStock")}</button></div>
        <datalist id="dl-items-nak">{[...items.values()].map(i => <option key={i.sifra} value={i.sifra}>{i.naziv}</option>)}</datalist>
        <div className="table-wrap" onKeyDown={gridKeys(addRow)}>
          <table className="data-table grid"><thead><tr><th>{t("sifra")}</th><th>{t("naziv")}</th><th>{t("lokacija")}</th><th>{t("colSystem")}</th><th>{t("colCounted")}</th><th>{t("colDiff")}</th><th></th></tr></thead>
            <tbody>{lines.map((l, i) => { const it = items.get(l.sifra.trim()); const d = diffOf(l); return (
              <tr key={i}>
                <td><input list="dl-items-nak" value={l.sifra} onChange={e => setLine(i, { sifra: e.target.value })} /></td>
                <td className="nm">{it ? `${it.naziv} (${it.jm})` : ""}</td>
                <td><select value={l.locId} onChange={e => setLine(i, { locId: e.target.value })}>{scopeOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></td>
                <td className="num">{exp.get(stockId(l.locId, l.sifra.trim())) ?? 0}</td>
                <td><input className="num" type="number" min={0} step={1} value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} /></td>
                <td className="num" style={{ color: d === null || d === 0 ? undefined : d > 0 ? "var(--color-success)" : "var(--color-danger)" }}>{d === null ? "" : d > 0 ? `+${d}` : d}</td>
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
      <h2>{t("popisHist")}</h2>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>{t("datum")}</th><th>{t("tip")}</th><th>{t("confirmedBy")}</th></tr></thead>
        <tbody>{confirmed.map(p => <tr key={p.id}><td>{p.datum}</td><td>{p.id === wid ? t("popisInitial") : t("popisLater")}</td><td>{p.confirmedBy ?? ""}</td></tr>)}</tbody></table></div>
    </>
  );
}
