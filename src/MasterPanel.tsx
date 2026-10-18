import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

type Row = { id: string; name: string; status: string; warehouses: string[]; ownerUid: string };

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
    <section className="card wide">
      <h1>{t("masterTitle")}</h1>
      {rows.length === 0 && <p>{t("noCompanies")}</p>}
      {rows.map(r => (
        <div className="row" key={r.id}>
          <div><strong>{r.name}</strong><div className="hint">{r.warehouses?.join(", ")} · {t("st_" + r.status)}</div></div>
          <div className="actions">
            {r.status !== "approved" && <button onClick={() => set(r.id, "approved")}>{t("approve")}</button>}
            {r.status !== "rejected" && <button className="secondary" onClick={() => set(r.id, "rejected")}>{t("reject")}</button>}
            {r.status !== "pending" && <button className="ghost" onClick={() => set(r.id, "pending")}>{t("reopen")}</button>}
          </div>
        </div>
      ))}
      {err && <p className="err" role="alert">{err}</p>}
    </section>
  );
}
