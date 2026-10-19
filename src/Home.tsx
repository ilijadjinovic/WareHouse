import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { col, loadLocs, pathOf, type Loc } from "./lib";

type Mv = { id: string; type: string; datum: string; sifra: string; locId: string; delta: number; createdByName?: string };
type Pend = { id: string; datum: string; magacionerIme?: string; lines: unknown[] };

export default function Home({ companyId, role, go }: { companyId: string; role: string; go: (tab: string) => void }) {
  const { t } = useTranslation();
  const [d, setD] = useState<{ items: number; locs: Loc[]; noPopis: string[]; pend: Pend[]; mv: Mv[]; names: Record<string, string> } | null>(null);
  const canApprove = role === "admin" || role === "rukovodilac";
  const canPopis = role !== "rukovodilac";

  useEffect(() => {
    (async () => {
      const [cnt, locs, pop, pend, mv] = await Promise.all([
        getCountFromServer(col(companyId, "items")), loadLocs(companyId), getDocs(col(companyId, "popisi")),
        getDocs(query(col(companyId, "docs"), where("status", "==", "cekanje"))),
        getDocs(query(col(companyId, "movements"), orderBy("createdAt", "desc"), limit(8)))]);
      const withPopis = new Set(pop.docs.filter(x => x.data().status === "confirmed").map(x => x.data().warehouseId as string));
      const movs = mv.docs.map(x => ({ id: x.id, ...(x.data() as Omit<Mv, "id">) }));
      const names: Record<string, string> = {};
      await Promise.all([...new Set(movs.map(m => m.sifra))].map(async s => { const it = await getDoc(doc(db, "companies", companyId, "items", s)); if (it.exists()) names[s] = String(it.data().naziv ?? ""); }));
      setD({
        items: cnt.data().count, locs, names, mv: movs,
        noPopis: locs.filter(l => l.type === "warehouse" && !withPopis.has(l.id)).map(l => l.name),
        pend: pend.docs.map(x => ({ id: x.id, ...(x.data() as Omit<Pend, "id">) })).sort((a, b) => b.datum.localeCompare(a.datum)),
      });
    })();
  }, [companyId]);

  if (!d) return <p>…</p>;
  const stat = (v: number, label: string) => (
    <div className="panel" style={{ marginBottom: 0 }}><div style={{ fontSize: 28, fontWeight: 700 }}>{v}</div><div className="hint">{label}</div></div>);
  const typeLabel = (x: string) => x === "storno" ? t("mvStorno") : t("nav_" + x);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 20 }}>
        {stat(d.items, t("homeItems"))}
        {stat(d.locs.filter(l => l.type === "warehouse").length, t("homeWarehouses"))}
        {stat(d.locs.filter(l => l.type !== "warehouse").length, t("homeLocations"))}
        {canApprove && stat(d.pend.length, t("homePending"))}
      </div>

      {d.noPopis.length > 0 && (
        <section className="panel"><h2>{t("homeNoPopis")}</h2>
          <p>{d.noPopis.join(", ")}</p>
          {canPopis && <div className="actions"><button type="button" onClick={() => go("popis")}>{t("nav_popis")}</button></div>}
        </section>)}

      {canApprove && d.pend.length > 0 && (
        <section className="panel"><h2>{t("homePendingList")}</h2>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>{t("datum")}</th><th>{t("magacioner")}</th><th>{t("homeLines")}</th></tr></thead>
            <tbody>{d.pend.map(p => <tr key={p.id}><td>{p.datum}</td><td>{p.magacionerIme ?? ""}</td><td className="num">{p.lines.length}</td></tr>)}</tbody></table></div>
          <div className="actions"><button type="button" onClick={() => go("izlaz")}>{t("homeOpenIssues")}</button></div>
        </section>)}

      <section className="panel"><h2>{t("homeRecent")}</h2>
        {d.mv.length === 0 ? <p className="hint">{t("homeNoMoves")}</p> :
          <div className="table-wrap"><table className="data-table"><thead><tr><th>{t("datum")}</th><th>{t("tip")}</th><th>{t("sifra")}</th><th>{t("naziv")}</th><th>{t("lokacija")}</th><th>{t("kolicina")}</th><th>{t("magacioner")}</th></tr></thead>
            <tbody>{d.mv.map(m => <tr key={m.id}><td>{m.datum}</td><td>{typeLabel(m.type)}</td><td>{m.sifra}</td><td className="nm">{d.names[m.sifra] ?? ""}</td>
              <td>{pathOf(d.locs, m.locId)}</td><td className="num" style={{ color: m.delta > 0 ? "var(--color-success)" : "var(--color-danger)" }}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td><td>{m.createdByName ?? ""}</td></tr>)}</tbody></table></div>}
      </section>
    </>
  );
}
