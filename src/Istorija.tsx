import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Item } from "./Items";
import { descendants, loadItems, loadLocs, pathOf, today, type Loc } from "./lib";
import { addDays, snapshotsBetween, splitKey, stateAt, syncSnapshots, type State } from "./snapshots";

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export default function Istorija({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Map<string, Item>>(new Map()); const [locs, setLocs] = useState<Loc[]>([]);
  const [date, setDate] = useState(today()); const [node, setNode] = useState(""); const [cat, setCat] = useState(""); const [q, setQ] = useState("");
  const [cur, setCur] = useState<State | null>(null); const [prev, setPrev] = useState<State>({}); const [busy, setBusy] = useState(true);
  const [s, setS] = useState({ sifra: "", from: addDays(today(), -29), to: today() });
  const [series, setSeries] = useState<{ datum: string; qty: number }[] | null>(null);

  useEffect(() => { (async () => { const [i, l] = await Promise.all([loadItems(companyId), loadLocs(companyId)]); setItems(i); setLocs(l); })(); }, [companyId]);
  useEffect(() => {
    let live = true; setBusy(true);
    (async () => {
      try { await syncSnapshots(companyId); } catch (e) { console.warn(e); }
      const [a, b] = await Promise.all([stateAt(companyId, date), stateAt(companyId, addDays(date, -1))]);
      if (live) { setCur(a); setPrev(b); setBusy(false); }
    })();
    return () => { live = false; };
  }, [companyId, date]);

  const scope = useMemo(() => (node ? descendants(locs, node) : null), [locs, node]);
  const opts = locs.map(l => ({ id: l.id, label: pathOf(locs, l.id) })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const cats = [...new Set([...items.values()].map(i => i.kategorija))].sort();
  const sum = (st: State, sifra?: string) => {
    const m = new Map<string, number>();
    Object.entries(st).forEach(([k, v]) => { const x = splitKey(k); if ((!scope || scope.has(x.locId)) && (!sifra || x.sifra === sifra)) m.set(x.sifra, (m.get(x.sifra) ?? 0) + v); });
    return m;
  };
  const rows = useMemo(() => {
    if (!cur) return [];
    const a = sum(cur), b = sum(prev);
    return [...new Set([...a.keys(), ...b.keys()])].map(sifra => ({ sifra, it: items.get(sifra), qty: a.get(sifra) ?? 0, d: (a.get(sifra) ?? 0) - (b.get(sifra) ?? 0) }))
      .filter(r => (r.qty !== 0 || r.d !== 0) && (!cat || r.it?.kategorija === cat) && (!q || (r.sifra + " " + (r.it?.naziv ?? "")).toLowerCase().includes(q.toLowerCase())))
      .sort((x, y) => x.sifra.localeCompare(y.sifra, undefined, { numeric: true }));
  }, [cur, prev, scope, items, cat, q]);

  const showSeries = async () => {
    setBusy(true);
    try { await syncSnapshots(companyId); } catch (e) { console.warn(e); }
    const snaps = await snapshotsBetween(companyId, s.from, s.to);
    setSeries(snaps.map(x => ({ datum: x.datum, qty: sum(x.stanje, s.sifra.trim()).get(s.sifra.trim()) ?? 0 })));
    setBusy(false);
  };
  const it = items.get(s.sifra.trim());

  return (
    <>
      <section className="panel">
        <div className="toolbar">
          <label className="inline">{t("hDate")} <input type="date" max={today()} value={date} onChange={e => e.target.value && setDate(e.target.value)} /></label>
          <select value={node} onChange={e => setNode(e.target.value)}><option value="">{t("allLocations")}</option>{opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          <select value={cat} onChange={e => setCat(e.target.value)}><option value="">{t("allCategories")}</option>{cats.map(c => <option key={c}>{c}</option>)}</select>
          <input placeholder={t("search")} value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {busy && <p className="hint">{t("hSync")}</p>}
        {!busy && rows.length === 0 ? <p className="muted">{t("hNoSnap")}</p> : (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>{t("sifra")}</th><th>{t("naziv")}</th><th>{t("kategorija")}</th><th>{t("kolicina")}</th><th>{t("jm")}</th><th>{t("hDelta")}</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.sifra}><td>{r.sifra}</td><td className="wrap-col">{r.it?.naziv}</td><td>{r.it?.kategorija}</td><td><strong>{r.qty}</strong></td><td>{r.it?.jm}</td>
              <td style={{ color: r.d > 0 ? "var(--color-success)" : r.d < 0 ? "var(--color-danger)" : undefined }}>{r.d === 0 ? "" : signed(r.d)}</td></tr>)}</tbody></table></div>)}
      </section>

      <section className="panel">
        <h2>{t("hSeries")}</h2>
        <datalist id="dl-items">{[...items.values()].map(i => <option key={i.sifra} value={i.sifra}>{i.naziv}</option>)}</datalist>
        <div className="toolbar">
          <input list="dl-items" placeholder={t("hItem")} value={s.sifra} onChange={e => setS({ ...s, sifra: e.target.value })} />
          <label className="inline">{t("hFrom")} <input type="date" max={today()} value={s.from} onChange={e => setS({ ...s, from: e.target.value })} /></label>
          <label className="inline">{t("hTo")} <input type="date" max={today()} value={s.to} onChange={e => setS({ ...s, to: e.target.value })} /></label>
          <button type="button" disabled={!it || busy} onClick={showSeries}>{t("hShow")}</button>
        </div>
        {series && (series.length === 0 ? <p className="muted">{t("hNoSnap")}</p> : (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>{t("datum")}</th><th>{t("kolicina")} ({it?.jm})</th><th>{t("rChange")}</th></tr></thead>
            <tbody>{series.map((r, i) => { const d = i === 0 ? 0 : r.qty - series[i - 1].qty;
              return <tr key={r.datum}><td>{r.datum}</td><td><strong>{r.qty}</strong></td><td style={{ color: d > 0 ? "var(--color-success)" : d < 0 ? "var(--color-danger)" : undefined }}>{d === 0 ? "" : signed(d)}</td></tr>; })}</tbody></table></div>))}
      </section>
    </>
  );
}
