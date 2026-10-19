import { doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { col, today } from "./lib";

/** Stanje: "locId_sifra" -> količina (samo veće od nule). */
export type State = Record<string, number>;
type Mv = { locId: string; sifra: string; delta: number; datum: string; type?: string };

export const addDays = (d: string, n: number) => {
  const t = new Date(d + "T12:00:00"); t.setDate(t.getDate() + n); const p = (x: number) => String(x).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
};
export const splitKey = (k: string) => { const i = k.indexOf("_"); return { locId: k.slice(0, i), sifra: k.slice(i + 1) }; };
const snapRef = (cid: string, day: string) => doc(db, "companies", cid, "snapshots", day);
const apply = (st: State, m: Mv) => { const k = `${m.locId}_${m.sifra}`; const v = (st[k] ?? 0) + m.delta; if (v === 0) delete st[k]; else st[k] = v; };
const same = (a: State, b: State) => { const ka = Object.keys(a); return ka.length === Object.keys(b).length && ka.every(k => a[k] === b[k]); };

/** Dnevna stanja se računaju iz dnevnika kretanja: dopuni dane koji nedostaju i preračunaj od datuma kasnog knjiženja. */
export async function syncSnapshots(cid: string): Promise<void> {
  const tod = today();
  const last = await getDocs(query(col(cid, "snapshots"), orderBy("datum", "desc"), limit(1)));
  const lastDate = last.empty ? "" : (last.docs[0].data().datum as string);
  const meta = await getDoc(doc(db, "companies", cid, "meta", "snapshots"));
  const dirty = meta.exists() ? ((meta.data().dirtyFrom as string) || "") : "";
  let from: string;
  if (!lastDate) {
    const e = await getDocs(query(col(cid, "movements"), orderBy("datum", "asc"), limit(1)));
    if (e.empty) return; from = e.docs[0].data().datum as string;
  } else from = dirty && dirty < lastDate ? dirty : lastDate;
  if (from > tod) return;

  let base: State = {};
  const prev = await getDoc(snapRef(cid, addDays(from, -1)));
  const moves = (await getDocs(query(col(cid, "movements"), where("datum", ">=", from)))).docs.map(d => d.data() as Mv);
  if (prev.exists()) base = { ...(prev.data().stanje as State) };
  else if (lastDate) (await getDocs(query(col(cid, "movements"), where("datum", "<", from)))).docs.forEach(d => apply(base, d.data() as Mv));

  const byDay = new Map<string, Mv[]>();
  moves.forEach(m => { const a = byDay.get(m.datum) ?? []; a.push(m); byDay.set(m.datum, a); });
  const days: { day: string; st: State }[] = []; let st = base;
  for (let d = from; d <= tod; d = addDays(d, 1)) { st = { ...st }; (byDay.get(d) ?? []).forEach(m => apply(st, m)); days.push({ day: d, st }); }

  if (lastDate === tod && !dirty && days.length === 1 && same(days[0].st, (last.docs[0].data().stanje ?? {}) as State)) return;
  for (let i = 0; i < days.length; i += 300) {
    const b = writeBatch(db);
    days.slice(i, i + 300).forEach(x => b.set(snapRef(cid, x.day), { datum: x.day, stanje: x.st, updatedAt: serverTimestamp() }));
    await b.commit();
  }
  if (dirty) await setDoc(doc(db, "companies", cid, "meta", "snapshots"), { dirtyFrom: "" });
}

/** Stanje na kraju izabranog dana (poslednji dostupan snimak do tog dana). */
export async function stateAt(cid: string, day: string): Promise<State> {
  const s = await getDoc(snapRef(cid, day));
  if (s.exists()) return s.data().stanje as State;
  const q = await getDocs(query(col(cid, "snapshots"), where("datum", "<=", day), orderBy("datum", "desc"), limit(1)));
  return q.empty ? {} : (q.docs[0].data().stanje as State);
}

export async function snapshotsBetween(cid: string, from: string, to: string): Promise<{ datum: string; stanje: State }[]> {
  const s = await getDocs(query(col(cid, "snapshots"), where("datum", ">=", from), where("datum", "<=", to), orderBy("datum", "asc")));
  return s.docs.map(d => d.data() as { datum: string; stanje: State });
}

export async function movementsBetween(cid: string, from: string, to: string): Promise<Mv[]> {
  const s = await getDocs(query(col(cid, "movements"), where("datum", ">=", from), where("datum", "<=", to)));
  return s.docs.map(d => d.data() as Mv);
}
