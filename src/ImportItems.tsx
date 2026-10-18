import { useState } from "react";
import { useTranslation } from "react-i18next";
import readXlsxFile from "read-excel-file";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { validSifra, type Item } from "./Items";

const N = (v: unknown) => String(v ?? "").trim();
const COLS: Record<keyof Item, string[]> = {
  sifra: ["ŠIFRA", "SIFRA"], kategorija: ["KATEGORIJA"], naziv: ["NAZIV ARTIKLA", "NAZIV"],
  jm: ["J. MERE", "J.MERE", "JM", "JEDINICA MERE"], napomena: ["NAPOMENA"]
};
type Parsed = { row: number; item: Item; status: "new" | "exists" | "error"; why?: string };

export default function ImportItems({ companyId, existing, onDone }: { companyId: string; existing: Set<string>; onDone: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Parsed[] | null>(null); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setMsg(""); setRows(null);
    try {
      let data;
      try { data = await readXlsxFile(file, { sheet: "ŠIFRARNIK" }); } catch { data = await readXlsxFile(file); }
      const head = (data[0] ?? []).map(h => N(h).toUpperCase());
      const idx = {} as Record<keyof Item, number>; const missing: string[] = [];
      (Object.keys(COLS) as (keyof Item)[]).forEach(k => {
        idx[k] = head.findIndex(h => COLS[k].includes(h));
        if (idx[k] < 0 && k !== "napomena") missing.push(COLS[k][0]);
      });
      if (missing.length) { setMsg(t("importMissing", { cols: missing.join(", ") })); return; }
      const seen = new Set<string>(); const out: Parsed[] = [];
      data.slice(1).forEach((r, n) => {
        if (r.every(c => N(c) === "")) return;
        const item: Item = { sifra: N(r[idx.sifra]), kategorija: N(r[idx.kategorija]), naziv: N(r[idx.naziv]), jm: N(r[idx.jm]), napomena: idx.napomena >= 0 ? N(r[idx.napomena]) : "" };
        let status: Parsed["status"] = "new"; let why: string | undefined;
        if (!item.sifra || !item.kategorija || !item.naziv || !item.jm) { status = "error"; why = t("errEmpty"); }
        else if (!validSifra(item.sifra)) { status = "error"; why = t("errSifraChars"); }
        else if (seen.has(item.sifra)) { status = "error"; why = t("errDupFile"); }
        else if (existing.has(item.sifra)) status = "exists";
        if (item.sifra) seen.add(item.sifra);
        out.push({ row: n + 2, item, status, why });
      });
      setRows(out);
    } catch (ex) { console.error(ex); setMsg(t("importRead")); }
  };

  const run = async () => {
    if (!rows) return; setBusy(true); setMsg("");
    const fresh = rows.filter(r => r.status === "new");
    try {
      for (let i = 0; i < fresh.length; i += 400) {
        const b = writeBatch(db);
        fresh.slice(i, i + 400).forEach(r => b.set(doc(db, "companies", companyId, "items", r.item.sifra), { ...r.item, createdAt: serverTimestamp() }));
        await b.commit();
      }
      setMsg(t("importDone", { n: fresh.length })); setRows(null); onDone();
    } catch (ex) { console.error(ex); setMsg(t("errSave")); }
    setBusy(false);
  };

  const c = (s: string) => rows?.filter(r => r.status === s).length ?? 0;
  const errs = rows?.filter(r => r.status === "error") ?? [];
  return (
    <div className="subform">
      <p className="hint">{t("importHelp")}</p>
      <input type="file" accept=".xlsx" onChange={onFile} />
      {rows && <>
        <p>{t("importNew")}: <strong>{c("new")}</strong> · {t("importExisting")}: {c("exists")} · {t("importErrors")}: {errs.length}</p>
        {errs.slice(0, 20).map(r => <p className="err" key={r.row}>{t("row")} {r.row}: {r.item.sifra || "—"} ({r.why})</p>)}
        <button disabled={busy || c("new") === 0} onClick={run}>{t("importDo")} ({c("new")})</button>
      </>}
      {msg && <p className={msg.startsWith("Uvezeno") || msg.startsWith("Imported") ? "" : "err"} role="status">{msg}</p>}
    </div>
  );
}
