import { collection, doc, getDocs, runTransaction, serverTimestamp, type DocumentReference } from "firebase/firestore";
import type React from "react";
import type { TFunction } from "i18next";
import { db } from "./firebase";
import type { Item } from "./Items";

export type Loc = { id: string; name: string; type: "warehouse" | "sub" | "pos"; parentId: string | null };
export type Mov = { sifra: string; locId: string; delta: number; datum: string; type: string; extra?: Record<string, unknown> };
export type Me = { uid: string; name: string };

export class Fail extends Error {
  key: string; p: Record<string, unknown>;
  constructor(key: string, p: Record<string, unknown> = {}) { super(key); this.key = key; this.p = p; }
}
export const errText = (t: TFunction, ex: unknown): string => {
  if (ex instanceof Fail) return String(t(ex.key, ex.p));
  console.error(ex); return String(t("errSave"));
};

export const today = () => {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const col = (cid: string, name: string) => collection(db, "companies", cid, name);
export const stockId = (locId: string, sifra: string) => `${locId}_${sifra}`;
export const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));

export async function loadLocs(cid: string): Promise<Loc[]> {
  const s = await getDocs(col(cid, "locations"));
  return s.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Loc, "id">) }));
}
export async function loadItems(cid: string): Promise<Map<string, Item>> {
  const s = await getDocs(col(cid, "items"));
  return new Map(s.docs.map(d => [d.id, d.data() as Item]));
}
export async function loadPopisDates(cid: string): Promise<Record<string, string>> {
  const s = await getDocs(col(cid, "popisi")); const o: Record<string, string> = {};
  s.docs.forEach(d => { const x = d.data(); if (x.status === "confirmed" && (!o[x.warehouseId] || x.datum > o[x.warehouseId])) o[x.warehouseId] = x.datum; });
  return o;
}
export async function loadStock(cid: string): Promise<Map<string, { sifra: string; locId: string; qty: number }>> {
  const s = await getDocs(col(cid, "stock"));
  return new Map(s.docs.map(d => [d.id, d.data() as { sifra: string; locId: string; qty: number }]));
}

export function pathOf(locs: Loc[], id: string) {
  const m = new Map(locs.map(l => [l.id, l])); const out: string[] = []; let c = m.get(id);
  while (c) { out.unshift(c.name); c = c.parentId ? m.get(c.parentId) : undefined; }
  return out.join(" › ");
}
export function rootOf(locs: Loc[], id: string) {
  const m = new Map(locs.map(l => [l.id, l])); let c = m.get(id);
  while (c && c.parentId) c = m.get(c.parentId);
  return c ? c.id : id;
}
export function descendants(locs: Loc[], id: string) {
  const out = new Set<string>([id]); let grew = true;
  while (grew) { grew = false; locs.forEach(l => { if (l.parentId && out.has(l.parentId) && !out.has(l.id)) { out.add(l.id); grew = true; } }); }
  return out;
}

/** Proverava da stanje ni na jedan dan (od prvog kretanja) ne padne ispod nule kad se doda novo kretanje. */
export async function checkHistory(cid: string, movs: Mov[]): Promise<{ sifra: string; datum: string } | null> {
  const outs = movs.filter(m => m.delta < 0);
  const sifre = [...new Set(outs.map(m => m.sifra))];
  const { query, where } = await import("firebase/firestore");
  for (const s of sifre) {
    const snap = await getDocs(query(col(cid, "movements"), where("sifra", "==", s)));
    const existing = snap.docs.map(d => d.data() as { locId: string; delta: number; datum: string });
    for (const locId of new Set(outs.filter(m => m.sifra === s).map(m => m.locId))) {
      const ev = [...existing.filter(e => e.locId === locId), ...movs.filter(m => m.sifra === s && m.locId === locId)]
        .sort((a, b) => a.datum.localeCompare(b.datum));
      let run = 0;
      for (let i = 0; i < ev.length; i++) {
        run += ev[i].delta;
        if ((i === ev.length - 1 || ev[i + 1].datum !== ev[i].datum) && run < 0) return { sifra: s, datum: ev[i].datum };
      }
    }
  }
  return null;
}

/** Atomično: kretanja + nova stanja (+ opciono dokument). Stanje ne sme ispod nule. */
export async function post(cid: string, movs: Mov[], me: Me, docRef?: DocumentReference,
  docData?: Record<string, unknown>, mode: "set" | "update" = "set") {
  await runTransaction(db, async tx => {
    const agg = new Map<string, { sifra: string; locId: string; d: number }>();
    movs.forEach(m => {
      const k = stockId(m.locId, m.sifra); const a = agg.get(k) ?? { sifra: m.sifra, locId: m.locId, d: 0 };
      a.d += m.delta; agg.set(k, a);
    });
    const keys = [...agg.keys()];
    const snaps = await Promise.all(keys.map(k => tx.get(doc(db, "companies", cid, "stock", k))));
    const next = keys.map((k, i) => {
      const a = agg.get(k)!; const q = (snaps[i].exists() ? (snaps[i].data()!.qty as number) : 0) + a.d;
      if (q < 0) throw new Fail("errStock", { s: a.sifra });
      return { k, a, q };
    });
    next.forEach(n => tx.set(doc(db, "companies", cid, "stock", n.k), { sifra: n.a.sifra, locId: n.a.locId, qty: n.q }));
    movs.forEach(m => tx.set(doc(col(cid, "movements")), {
      type: m.type, datum: m.datum, sifra: m.sifra, locId: m.locId, delta: m.delta, docId: docRef?.id ?? null,
      ...m.extra, createdAt: serverTimestamp(), createdBy: me.uid, createdByName: me.name
    }));
    if (docRef && docData) { if (mode === "set") tx.set(docRef, docData); else tx.update(docRef, docData); }
  });
}

/** Enter prebacuje u sledeće polje; Enter u poslednjem polju poziva onLast (novi red). */
export function gridKeys(onLast: () => void) {
  const SEL = "input:not([disabled]):not([type=file]):not([type=checkbox]),select:not([disabled])";
  return (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter") return;
    const el = e.target as HTMLElement;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
    e.preventDefault();
    const root = e.currentTarget; const all = () => Array.from(root.querySelectorAll<HTMLElement>(SEL));
    const i = all().indexOf(el);
    if (i < all().length - 1) all()[i + 1].focus();
    else { onLast(); setTimeout(() => all()[i + 1]?.focus(), 30); }
  };
}
