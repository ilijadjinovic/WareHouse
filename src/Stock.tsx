import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Item } from "./Items";
import { descendants, loadItems, loadLocs, loadStock, pathOf, type Loc } from "./lib";

export default function Stock({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Map<string, Item>>(new Map()); const [locs, setLocs] = useState<Loc[]>([]);
  const [stock, setStock] = useState<{ sifra: string; locId: string; qty: number }[]>([]);
  const [node, setNode] = useState(""); const [q, setQ] = useState(""); const [cat, setCat] = useState("");
  useEffect(() => { (async () => { const [i, l, s] = await Promise.all([loadItems(companyId), loadLocs(companyId), loadStock(companyId)]); setItems(i); setLocs(l); setStock([...s.values()]); })(); }, [companyId]);

  const scope = useMemo(() => node ? descendants(locs, node) : null, [locs, node]);
  const rows = useMemo(() => {
    const m = new Map<string, { total: number; parts: string[] }>();
    stock.filter(s => s.qty > 0 && (!scope || scope.has(s.locId))).forEach(s => {
      const r = m.get(s.sifra) ?? { total: 0, parts: [] }; r.total += s.qty; r.parts.push(`${pathOf(locs, s.locId)}: ${s.qty}`); m.set(s.sifra, r);
    });
    return [...m.entries()].map(([sifra, r]) => ({ sifra, it: items.get(sifra), ...r }))
      .filter(r => (!cat || r.it?.kategorija === cat) && (!q || (r.sifra + " " + (r.it?.naziv ?? "")).toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => a.sifra.localeCompare(b.sifra, undefined, { numeric: true }));
  }, [stock, scope, items, locs, q, cat]);
  const cats = [...new Set([...items.values()].map(i => i.kategorija))].sort();
  const opts = locs.map(l => ({ id: l.id, label: pathOf(locs, l.id) })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  return (
    <section className="card wide">
      <h1>{t("stockTitle")}</h1>
      <div className="toolbar">
        <select value={node} onChange={e => setNode(e.target.value)}><option value="">{t("allLocations")}</option>{opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        <select value={cat} onChange={e => setCat(e.target.value)}><option value="">{t("allCategories")}</option>{cats.map(c => <option key={c}>{c}</option>)}</select>
        <input placeholder={t("search")} value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {rows.length === 0 ? <p>{t("noStock")}</p> : (
        <div className="scroll"><table>
          <thead><tr><th>{t("sifra")}</th><th>{t("naziv")}</th><th>{t("kategorija")}</th><th>{t("total")}</th><th>{t("jm")}</th><th>{t("perLoc")}</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.sifra}><td>{r.sifra}</td><td>{r.it?.naziv}</td><td>{r.it?.kategorija}</td><td><strong>{r.total}</strong></td><td>{r.it?.jm}</td><td className="hint">{r.parts.join(" · ")}</td></tr>)}</tbody></table></div>
      )}
    </section>
  );
}
