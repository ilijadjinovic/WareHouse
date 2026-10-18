import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";

type Loc = { id: string; name: string; type: "warehouse" | "sub" | "pos"; parentId: string | null };

export default function Locations({ companyId, role, regNames }: { companyId: string; role: string; regNames: string[] }) {
  const { t } = useTranslation();
  const canWrite = role === "admin" || role === "magacioner";
  const [locs, setLocs] = useState<Loc[]>([]); const [err, setErr] = useState("");
  const col = collection(db, "companies", companyId, "locations");
  const load = async () => {
    const s = await getDocs(col);
    setLocs(s.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Loc, "id">) })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
  };
  useEffect(() => { load(); }, [companyId]);

  const kids = (id: string | null) => locs.filter(l => l.parentId === id);
  const askName = (initial = "") => (prompt(t("locName"), initial) ?? "").trim();
  const unique = (name: string, parentId: string | null, selfId?: string) =>
    !!name && !kids(parentId).some(l => l.id !== selfId && l.name.toLowerCase() === name.toLowerCase());

  const add = async (parentId: string | null, type: Loc["type"]) => {
    setErr(""); const name = askName(); if (!name) return;
    if (!unique(name, parentId)) { setErr(t("errName")); return; }
    try { await addDoc(col, { name, type, parentId, createdAt: serverTimestamp() }); await load(); } catch { setErr(t("errSave")); }
  };
  const rename = async (l: Loc) => {
    setErr(""); const name = askName(l.name); if (!name || name === l.name) return;
    if (!unique(name, l.parentId, l.id)) { setErr(t("errName")); return; }
    try { await updateDoc(doc(col, l.id), { name }); await load(); } catch { setErr(t("errUpdate")); }
  };
  const remove = async (l: Loc) => {
    setErr(""); if (kids(l.id).length) { setErr(t("errLocDelete")); return; }
    if (!confirm(t("confirmDelete"))) return;
    try { await deleteDoc(doc(col, l.id)); await load(); } catch { setErr(t("errUpdate")); }
  };
  const fromReg = async () => {
    setErr("");
    try {
      const b = writeBatch(db);
      regNames.forEach(name => b.set(doc(col), { name, type: "warehouse", parentId: null, createdAt: serverTimestamp() }));
      await b.commit(); await load();
    } catch { setErr(t("errSave")); }
  };

  const node = (l: Loc, depth: number): React.ReactNode => (
    <div key={l.id}>
      <div className="row" style={{ paddingLeft: depth * 24 }}>
        <div><strong>{l.name}</strong> <span className="hint">{t("loc_" + l.type)}</span></div>
        <div className="actions">
          {canWrite && l.type === "warehouse" && <button className="ghost" onClick={() => add(l.id, "sub")}>{t("addSub")}</button>}
          {canWrite && l.type !== "pos" && <button className="ghost" onClick={() => add(l.id, "pos")}>{t("addPos")}</button>}
          {canWrite && <button className="ghost" onClick={() => rename(l)}>{t("rename")}</button>}
          {role === "admin" && <button className="ghost danger" onClick={() => remove(l)}>{t("del")}</button>}
        </div>
      </div>
      {kids(l.id).map(k => node(k, depth + 1))}
    </div>
  );

  const top = kids(null);
  return (
    <section className="panel">
      {canWrite && <div className="toolbar"><button onClick={() => add(null, "warehouse")}>{t("addWarehouse")}</button>
        {top.length === 0 && regNames.length > 0 && <button className="secondary" onClick={fromReg}>{t("createFromReg", { names: regNames.join(", ") })}</button>}</div>}
      {top.length === 0 ? <p>{t("noLocations")}</p> : top.map(l => node(l, 0))}
      {err && <p className="err" role="alert">{err}</p>}
    </section>
  );
}
