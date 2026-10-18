import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

type Row = { id: string; name: string; status: string; warehouses: string[]; ownerUid: string };
const BADGE: Record<string, string> = { pending: "badge-amber", approved: "badge-green", rejected: "badge-red" };

export default function MasterPanel() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]); const [err, setErr] = useState("");
  const load = async () => {
    const snap = await getDocs(collection(db, "companies"));
    setRows(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Row, "id">) })));
  };
  useEffect(() => { load(); }, []);
  const set = async (id: string, status: string) => {
    setErr("");
    try { await updateDoc(doc(db, "companies", id), { status }); await load(); } catch { setErr(t("errUpdate")); }
  };
  return (
    <section className="panel">
      {rows.length === 0 ? <p className="muted">{t("noCompanies")}</p> : (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>{t("companyName")}</th><th>{t("warehouses")}</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}>
              <td><strong>{r.name}</strong></td><td>{r.warehouses?.join(", ")}</td>
              <td><span className={"badge " + (BADGE[r.status] ?? "badge-gray")}>{t("st_" + r.status)}</span></td>
              <td><div className="actions">
                {r.status !== "approved" && <button onClick={() => set(r.id, "approved")}>{t("approve")}</button>}
                {r.status !== "rejected" && <button className="secondary" onClick={() => set(r.id, "rejected")}>{t("reject")}</button>}
                {r.status !== "pending" && <button className="ghost" onClick={() => set(r.id, "pending")}>{t("reopen")}</button>}
              </div></td>
            </tr>))}</tbody></table></div>
      )}
      {err && <p className="err" role="alert">{err}</p>}
    </section>
  );
}
