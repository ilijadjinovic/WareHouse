import { getDocs } from "firebase/firestore";
import { col, descendants, loadLocs, loadStock } from "./lib";

export type Trigger = { sifra: string; locId: string; prag: number; nabavka?: boolean };
export type Alarm = Trigger & { id: string; stanje: number; low: boolean };

/** Triger se poredi sa zbirom stanja na izabranoj lokaciji i svim njenim podlokacijama. */
export async function loadAlarms(cid: string): Promise<Alarm[]> {
  const ts = await getDocs(col(cid, "triggers"));
  if (ts.empty) return [];
  const [locs, stock] = await Promise.all([loadLocs(cid), loadStock(cid)]);
  const cache = new Map<string, Set<string>>();
  return ts.docs.map(d => {
    const t = d.data() as Trigger;
    const set = cache.get(t.locId) ?? descendants(locs, t.locId); cache.set(t.locId, set);
    let sum = 0; stock.forEach(s => { if (s.sifra === t.sifra && set.has(s.locId)) sum += s.qty; });
    return { ...t, id: d.id, stanje: sum, low: sum < t.prag };
  });
}
