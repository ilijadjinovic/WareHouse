import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Item } from "./Items";
import { descendants, errText, loadItems, loadLocs, pathOf, today, type Loc } from "./lib";
import { addDays, movementsBetween, splitKey, stateAt, syncSnapshots, type State } from "./snapshots";
import { exportPdf, exportXlsx, type RepMeta, type RepRow } from "./exportReport";

const p2 = (n: number) => String(n).padStart(2, "0");
const monday = (d: string) => addDays(d, -((new Date(d + "T12:00:00").getDay() + 6) % 7));
function range(type: string, ref: string, cf: string, ct: string): [string, string] {
  const y = Number(ref.slice(0, 4)), m = Number(ref.slice(5, 7));
  let r: [string, string] = [ref, ref];
  if (type === "week") r = [monday(ref), addDays(monday(ref), 6)];
  if (type === "month") r = [`${y}-${p2(m)}-01`, `${y}-${p2(m)}-${p2(new Date(y, m, 0).getDate())}`];
  if (type === "year") r = [`${y}-01-01`, `${y}-12-31`];
  if (type === "custom") r = [cf, ct];
  return [r[0], r[1] > today() ? today() : r[1]];
}
const signed = (n: number) => (n === 0 ? "" : n > 0 ? `+${n}` : String(n));

export default function Izvestaj({ companyId, companyName, me }: { companyId: string; companyName: string; me: string }) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<Map<string, Item>>(new Map()); const [locs, setLocs] = useState<Loc[]>([]);
  const [type, setType] = useState("month"); const [ref, setRef] = useState(today());
  const [cf, setCf] = useState(addDays(today(), -29)); const [ct, setCt] = useState(today());
  const [node, setNode] = useState(""); const [cat, setCat] = useState("");
  const [res, setRes] = useState<{ rows: RepRow[]; from: string; to: string; madeOn: string; mismatch: number; scope: string; category: string } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  useEffect(() => { (async () => { const [i, l] = await Promise.all([loadItems(companyId), loadLocs(companyId)]); setItems(i); setLocs(l); })(); }, [companyId]);
  const opts = useMemo(() => locs.map(l => ({ id: l.id, label: pathOf(locs, l.id) })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), [locs]);
  const cats = [...new Set([...items.values()].map(i => i.kategorija))].sort();

  const make = async () => {
    setErr(""); setBusy(true); setRes(null);
    try {
      const [from, to] = range(type, ref, cf, ct);
      if (from > to) throw new Error("range");
      await syncSnapshots(companyId).catch(e => console.warn(e));
      const [a, b, mv] = await Promise.all([stateAt(companyId, addDays(from, -1)), stateAt(companyId, to), movementsBetween(companyId, from, to)]);
      const scope = node ? descendants(locs, node) : null;
      const map = new Map<string, RepRow>();
      const row = (sifra: string) => { let r = map.get(sifra); if (!r) { const it = items.get(sifra); r = { sifra, naziv: it?.naziv ?? "", kategorija: it?.kategorija ?? "", jm: it?.jm ?? "", start: 0, ulaz: 0, izlaz: 0, prenos: 0, popis: 0, storno: 0, change: 0, end: 0 }; map.set(sifra, r); } return r; };
      const sumState = (st: State, f: (r: RepRow, v: number) => void) => Object.entries(st).forEach(([k, v]) => { const x = splitKey(k); if (!scope || scope.has(x.locId)) f(row(x.sifra), v); });
      sumState(a, (r, v) => { r.start += v; }); sumState(b, (r, v) => { r.end += v; });
      mv.forEach(m => { if (scope && !scope.has(m.locId)) return; const r = row(m.sifra);
        if (m.type === "ulaz") r.ulaz += m.delta; else if (m.type === "izlaz") r.izlaz += m.delta; else if (m.type === "prenos") r.prenos += m.delta;
        else if (m.type === "popis") r.popis += m.delta; else r.storno += m.delta; });
      let mismatch = 0;
      const rows = [...map.values()].map(r => { r.change = r.ulaz + r.izlaz + r.prenos + r.popis + r.storno; if (r.start + r.change !== r.end) mismatch++; return r; })
        .filter(r => (!cat || r.kategorija === cat) && (r.start || r.end || r.change))
        .sort((x, y) => x.sifra.localeCompare(y.sifra, undefined, { numeric: true }));
      setRes({ rows, from, to, mismatch, madeOn: new Date().toLocaleString(i18n.language === "sr" ? "sr-Latn-RS" : "en-GB"),
        scope: node ? pathOf(locs, node) : t("allLocations"), category: cat || t("allCategories") });
    } catch (ex) { setErr(ex instanceof Error && ex.message === "range" ? t("rNone") : errText(t, ex)); }
    setBusy(false);
  };

  const meta = (): RepMeta => ({
    title: t("rTitle"), footerPage: t("rPage"),
    info: [[t("companyName"), companyName], [t("rPeriod"), `${res!.from} – ${res!.to}`], [t("rScope"), res!.scope], [t("kategorija"), res!.category], [t("rMadeOn"), res!.madeOn], [t("rMadeBy"), me]],
    head: [t("sifra"), t("naziv"), t("kategorija"), t("jm"), t("rStart"), t("rIn"), t("rOut"), t("rTransfer"), t("rCount"), t("rStorno"), t("rChange"), t("rEnd")],
  });
  const fname = (ext: string) => `Izvestaj_${res!.from}_${res!.to}.${ext}`;
  const run = async (fn: () => Promise<void>) => { setErr(""); try { await fn(); } catch (ex) { setErr(errText(t, ex)); } };

  return (
    <section className="panel">
      <div className="toolbar">
        <select value={type} onChange={e => setType(e.target.value)} aria-label={t("rPeriod")}>
          {["day", "week", "month", "year", "custom"].map(k => <option key={k} value={k}>{t("rP" + k)}</option>)}</select>
        {type !== "custom" ? <label className="inline">{t("rRef")} <input type="date" max={today()} value={ref} onChange={e => e.target.value && setRef(e.target.value)} /></label> : <>
          <label className="inline">{t("hFrom")} <input type="date" max={today()} value={cf} onChange={e => setCf(e.target.value)} /></label>
          <label className="inline">{t("hTo")} <input type="date" max={today()} value={ct} onChange={e => setCt(e.target.value)} /></label></>}
        <select value={node} onChange={e => setNode(e.target.value)}><option value="">{t("allLocations")}</option>{opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        <select value={cat} onChange={e => setCat(e.target.value)}><option value="">{t("allCategories")}</option>{cats.map(c => <option key={c}>{c}</option>)}</select>
        <button type="button" disabled={busy} onClick={make}>{t("rMake")}</button>
      </div>
      {busy && <p className="hint">{t("hSync")}</p>}
      {err && <p className="err" role="alert">{err}</p>}
      {res && (
        <>
          <div className="subform">
            <h2>{t("rTitle")}</h2>
            <div className="hdr">
              <div><span className="hint">{t("companyName")}</span><br />{companyName}</div>
              <div><span className="hint">{t("rPeriod")}</span><br />{res.from} – {res.to}</div>
              <div><span className="hint">{t("rScope")}</span><br />{res.scope}</div>
              <div><span className="hint">{t("kategorija")}</span><br />{res.category}</div>
              <div><span className="hint">{t("rMadeOn")}</span><br />{res.madeOn}</div>
              <div><span className="hint">{t("rMadeBy")}</span><br />{me}</div>
            </div>
          </div>
          {res.mismatch > 0 && <p className="err">{t("rMismatch", { n: res.mismatch })}</p>}
          {res.rows.length === 0 ? <p className="muted">{t("rNone")}</p> : (<>
            <div className="actions" style={{ marginBottom: 12 }}>
              <button type="button" className="secondary" onClick={() => run(() => exportXlsx(meta(), res.rows, fname("xlsx")))}>{t("rXlsx")}</button>
              <button type="button" className="secondary" onClick={() => run(() => exportPdf(meta(), res.rows, fname("pdf")))}>{t("rPdf")}</button>
            </div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>{t("sifra")}</th><th>{t("naziv")}</th><th>{t("jm")}</th><th>{t("rStart")}</th><th>{t("rIn")}</th><th>{t("rOut")}</th><th>{t("rTransfer")}</th><th>{t("rCount")}</th><th>{t("rStorno")}</th><th>{t("rChange")}</th><th>{t("rEnd")}</th></tr></thead>
              <tbody>{res.rows.map(r => <tr key={r.sifra}><td>{r.sifra}</td><td className="wrap-col">{r.naziv}</td><td>{r.jm}</td><td>{r.start}</td>
                <td>{signed(r.ulaz)}</td><td>{signed(r.izlaz)}</td><td>{signed(r.prenos)}</td><td>{signed(r.popis)}</td><td>{signed(r.storno)}</td>
                <td>{signed(r.change)}</td><td style={{ color: r.start + r.change !== r.end ? "var(--color-danger)" : undefined }}><strong>{r.end}</strong></td></tr>)}</tbody></table></div>
          </>)}
        </>)}
    </section>
  );
}
