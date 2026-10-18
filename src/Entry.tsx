import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import type { Item } from "./Items";
import { Fail, checkHistory, clean, col, errText, gridKeys, loadItems, loadLocs, loadPopisDates, loadStock, pathOf, post, rootOf, today, type Loc, type Me, type Mov } from "./lib";

type Type = "ulaz" | "izlaz" | "prenos";
type Line = { sifra: string; qty: string; locId: string; toLocId: string };
type DocRow = { id: string; type: Type; datum: string; status: string; lines: { sifra: string; kolicina: number; locId: string; toLocId?: string }[];
  otpremnica?: string; dobavljac?: string; osnov?: string; preuzeo?: string; magacionerIme?: string; odobrio?: string; nacin?: string };

export default function Entry({ companyId, role, type, me }: { companyId: string; role: string; type: Type; me: Me }) {
  const { t } = useTranslation();
  const canWrite = role === "admin" || role === "magacioner";
  const canApprove = role === "admin" || role === "rukovodilac";
  const ls = (k: string) => localStorage.getItem(`m:${companyId}:${type}:${k}`) ?? "";
  const keep = (k: string, v: string) => localStorage.setItem(`m:${companyId}:${type}:${k}`, v);

  const [items, setItems] = useState<Map<string, Item>>(new Map());
  const [locs, setLocs] = useState<Loc[]>([]);
  const [popis, setPopis] = useState<Record<string, string>>({});
  const [stock, setStock] = useState<Map<string, { qty: number }>>(new Map());
  const [rows, setRows] = useState<DocRow[]>([]);
  const [datum, setDatum] = useState(today());
  const [nacin, setNacin] = useState(ls("nacin")); const [otpremnica, setOtpremnica] = useState("");
  const [dobavljac, setDobavljac] = useState(ls("dobavljac")); const [osnov, setOsnov] = useState(ls("osnov"));
  const [preuzeo, setPreuzeo] = useState(""); const [napomena, setNapomena] = useState("");
  const blank = (): Line => ({ sifra: "", qty: "", locId: ls("loc"), toLocId: ls("toloc") });
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);

  const reload = async () => {
    const [i, l, p, s, d] = await Promise.all([loadItems(companyId), loadLocs(companyId), loadPopisDates(companyId), loadStock(companyId),
      getDocs(query(col(companyId, "docs"), where("type", "==", type)))]);
    setItems(i); setLocs(l); setPopis(p); setStock(s);
    setRows(d.docs.map(x => ({ id: x.id, ...(x.data() as Omit<DocRow, "id">) })).sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 50));
  };
  useEffect(() => { reload(); }, [companyId, type]);

  const locOpts = useMemo(() => locs.map(l => ({ id: l.id, label: pathOf(locs, l.id) })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })), [locs]);
  const nameOf = (id: string) => locs.find(l => l.id === id)?.name ?? id;
  const setLine = (i: number, patch: Partial<Line>) => setLines(ls2 => ls2.map((l, n) => n === i ? { ...l, ...patch } : l));
  const addRow = () => setLines(ls2 => [...ls2, { ...blank(), locId: ls2[ls2.length - 1]?.locId ?? ls("loc"), toLocId: ls2[ls2.length - 1]?.toLocId ?? ls("toloc") }]);
  const sel = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={e => onChange(e.target.value)}><option value="">—</option>
      {locOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setOk(""); setBusy(true);
    try {
      const used = lines.filter(l => l.sifra.trim() || l.qty.trim());
      if (!used.length) throw new Fail("errNoLines");
      if (datum > today()) throw new Fail("errFuture");
      const P = used.map(l => {
        const s = l.sifra.trim();
        if (!items.has(s)) throw new Fail("errNoItem", { s });
        if (!/^[1-9]\d*$/.test(l.qty.trim())) throw new Fail("errQty", { s });
        if (!l.locId || (type === "prenos" && !l.toLocId)) throw new Fail("errLoc");
        if (type === "prenos" && l.toLocId === l.locId) throw new Fail("errSame", { s });
        return { sifra: s, q: Number(l.qty), locId: l.locId, toLocId: l.toLocId };
      });
      let razlog: string | undefined;
      for (const id of new Set(P.flatMap(p => [p.locId, ...(type === "prenos" ? [p.toLocId] : [])]))) {
        const w = rootOf(locs, id); const pd = popis[w];
        if (!pd) throw new Fail("errNoPopis", { w: nameOf(w) });
        if (datum <= pd) {
          if (role !== "admin") throw new Fail("errBeforePopis", { d: pd });
          if (razlog === undefined) { razlog = (prompt(t("reasonPrompt", { d: pd })) ?? "").trim(); if (!razlog) throw new Fail("errReason"); }
        }
      }
      const ex = razlog ? { razlog } : {};
      const mk = (sifra: string, locId: string, delta: number, tp: string): Mov => ({ sifra, locId, delta, datum, type: tp, extra: ex });
      const movs: Mov[] = type === "ulaz" ? P.map(p => mk(p.sifra, p.locId, p.q, "ulaz"))
        : type === "izlaz" ? P.map(p => mk(p.sifra, p.locId, -p.q, "izlaz"))
        : P.flatMap(p => [mk(p.sifra, p.locId, -p.q, "prenos"), mk(p.sifra, p.toLocId, p.q, "prenos")]);
      if (type !== "ulaz") {
        const need = new Map<string, number>();
        movs.filter(m => m.delta < 0).forEach(m => need.set(`${m.locId}_${m.sifra}`, (need.get(`${m.locId}_${m.sifra}`) ?? 0) - m.delta));
        need.forEach((q, k) => { if (q > (stock.get(k)?.qty ?? 0)) throw new Fail("errStock", { s: k.slice(k.indexOf("_") + 1) }); });
        const h = await checkHistory(companyId, movs); if (h) throw new Fail("errHistory", { s: h.sifra, d: h.datum });
      }
      const ref = doc(col(companyId, "docs"));
      const data = clean({ type, datum, magacionerUid: me.uid, magacionerIme: me.name, createdAt: serverTimestamp(), razlog,
        nacin, otpremnica, dobavljac: type === "ulaz" ? dobavljac : "", osnov: type === "izlaz" ? osnov : "", preuzeo: type === "izlaz" ? preuzeo : "", napomena,
        lines: P.map(p => clean({ sifra: p.sifra, kolicina: p.q, locId: p.locId, toLocId: type === "prenos" ? p.toLocId : "" })) });
      if (type === "izlaz") { await setDoc(ref, { ...data, status: "cekanje" }); setOk(t("sentForApproval")); }
      else { await post(companyId, movs, me, ref, { ...data, status: "proknjizen" }); setOk(t("saved")); }
      keep("nacin", nacin); keep("dobavljac", dobavljac); keep("osnov", osnov);
      keep("loc", P[P.length - 1].locId); if (type === "prenos") keep("toloc", P[P.length - 1].toLocId);
      setLines([blank()]); setOtpremnica(""); setPreuzeo(""); setNapomena(""); await reload();
    } catch (ex) { setErr(errText(t, ex)); }
    setBusy(false);
  };

  const approve = async (d: DocRow, yes: boolean) => {
    setErr(""); setOk("");
    try {
      const dref = doc(db, "companies", companyId, "docs", d.id);
      if (!yes) { await updateDoc(dref, { status: "odbijen", odobrio: me.name, odobrioUid: me.uid, odobrenoAt: serverTimestamp() }); }
      else {
        const movs: Mov[] = d.lines.map(l => ({ sifra: l.sifra, locId: l.locId, delta: -l.kolicina, datum: d.datum, type: "izlaz" }));
        const h = await checkHistory(companyId, movs); if (h) throw new Fail("errHistory", { s: h.sifra, d: h.datum });
        await post(companyId, movs, me, dref, { status: "proknjizen", odobrio: me.name, odobrioUid: me.uid, odobrenoAt: serverTimestamp() }, "update");
      }
      await reload();
    } catch (ex) { setErr(errText(t, ex)); }
  };
  const storno = async (d: DocRow) => {
    if (!confirm(t("confirmStorno"))) return; setErr("");
    try {
      const snap = await getDocs(query(col(companyId, "movements"), where("docId", "==", d.id)));
      const movs: Mov[] = snap.docs.map(x => { const m = x.data(); return { sifra: m.sifra, locId: m.locId, delta: -m.delta, datum: m.datum, type: "storno", extra: { stornoOd: x.id } }; });
      const h = await checkHistory(companyId, movs); if (h) throw new Fail("errHistory", { s: h.sifra, d: h.datum });
      await post(companyId, movs, me, doc(db, "companies", companyId, "docs", d.id), { status: "storniran", storno: me.name }, "update");
      await reload();
    } catch (ex) { setErr(errText(t, ex)); }
  };

  return (
    <section className="card wide">
      <h1>{t("nav_" + type)}</h1>
      {canWrite && (
        <form onSubmit={submit}>
          <div className="hdr">
            <label>{t("datum")}<input type="date" max={today()} value={datum} onChange={e => setDatum(e.target.value)} required /></label>
            <label>{t("magacioner")}<input value={me.name} disabled /></label>
            {type !== "prenos" && <label>{t(type === "ulaz" ? "nacin" : "nacinPreuz")}<input value={nacin} onChange={e => setNacin(e.target.value)} /></label>}
            {type !== "prenos" && <label>{t("otpremnica")}<input value={otpremnica} onChange={e => setOtpremnica(e.target.value)} /></label>}
            {type === "ulaz" && <label>{t("dobavljac")}<input value={dobavljac} onChange={e => setDobavljac(e.target.value)} /></label>}
            {type === "izlaz" && <label>{t("osnov")}<input value={osnov} onChange={e => setOsnov(e.target.value)} /></label>}
            {type === "izlaz" && <label>{t("preuzeo")}<input value={preuzeo} onChange={e => setPreuzeo(e.target.value)} /></label>}
            {type === "prenos" && <label>{t("napomena")}<input value={napomena} onChange={e => setNapomena(e.target.value)} /></label>}
          </div>
          <datalist id="dl-items">{[...items.values()].map(i => <option key={i.sifra} value={i.sifra}>{i.naziv}</option>)}</datalist>
          <div className="scroll" onKeyDown={gridKeys(addRow)}>
            <table className="grid"><thead><tr><th>{t("sifra")}</th><th>{t("naziv")}</th><th>{t("kolicina")}</th>
              <th>{t(type === "prenos" ? "fromLoc" : "lokacija")}</th>{type === "prenos" && <th>{t("toLoc")}</th>}<th></th></tr></thead>
              <tbody>{lines.map((l, i) => { const it = items.get(l.sifra.trim()); return (
                <tr key={i}>
                  <td><input list="dl-items" value={l.sifra} onChange={e => setLine(i, { sifra: e.target.value })} /></td>
                  <td className="nm">{it ? `${it.naziv} (${it.jm})` : ""}</td>
                  <td><input className="num" type="number" min={1} step={1} value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} /></td>
                  <td>{sel(l.locId, v => setLine(i, { locId: v }))}</td>
                  {type === "prenos" && <td>{sel(l.toLocId, v => setLine(i, { toLocId: v }))}</td>}
                  <td><button type="button" tabIndex={-1} className="ghost" onClick={() => setLines(ls2 => ls2.length > 1 ? ls2.filter((_, n) => n !== i) : ls2)}>×</button></td>
                </tr>); })}</tbody></table>
          </div>
          <div className="actions" style={{ marginTop: 12 }}>
            <button type="button" className="secondary" onClick={addRow}>{t("addRow")}</button>
            <button type="submit" disabled={busy}>{t(type === "izlaz" ? "submitApproval" : "post")}</button>
          </div>
        </form>
      )}
      {err && <p className="err" role="alert">{err}</p>}{ok && <p className="ok" role="status">{ok}</p>}
      <h2>{t("docs")}</h2>
      {rows.length === 0 && <p>{t("noDocs")}</p>}
      {rows.map(d => (
        <div className="row" key={d.id}>
          <div>
            <strong>{d.datum}</strong> {d.otpremnica && <span>· {d.otpremnica}</span>} {d.dobavljac && <span>· {d.dobavljac}</span>} {d.preuzeo && <span>· {d.preuzeo}</span>}{" "}
            <span className="badge">{t("st_" + d.status)}</span>
            <div className="hint">{d.lines.map(l => `${l.sifra} × ${l.kolicina}`).join(", ")} · {d.magacionerIme}{d.odobrio ? ` · ${t("odobrio")}: ${d.odobrio}` : ""}</div>
          </div>
          <div className="actions">
            {type === "izlaz" && d.status === "cekanje" && canApprove && <>
              <button onClick={() => approve(d, true)}>{t("approveIssue")}</button>
              <button className="secondary" onClick={() => approve(d, false)}>{t("rejectIssue")}</button></>}
            {role === "admin" && d.status === "proknjizen" && <button className="ghost danger" onClick={() => storno(d)}>{t("storno")}</button>}
          </div>
        </div>))}
    </section>
  );
}
