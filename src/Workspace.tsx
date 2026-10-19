import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Items from "./Items";
import Locations from "./Locations";
import UsersAdmin from "./UsersAdmin";
import Stock from "./Stock";
import Popis from "./Popis";
import Entry from "./Entry";
import Alarmi from "./Alarmi";
import Istorija from "./Istorija";
import Izvestaj from "./Izvestaj";
import { loadAlarms, type Alarm } from "./alarms";
import { syncSnapshots } from "./snapshots";
import Home from "./Home";
import Profile, { type CompanyDoc } from "./Profile";
import { Shell } from "./Shell";
import type { Me } from "./lib";
import type { User } from "firebase/auth";

const ICON: Record<string, string> = { home: "🏠", stock: "📦", ulaz: "⬇️", izlaz: "⬆️", prenos: "🔁", popis: "📋", items: "🏷️", locations: "🏭", users: "👥", alarmi: "🔔", istorija: "🕘", izvestaj: "📈" };

export default function Workspace({ companyId, role, company, me, user, onChanged }: { companyId: string; role: string; company: CompanyDoc; me: Me; user: User; onChanged: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("home");
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const reloadAlarms = useCallback(() => { loadAlarms(companyId).then(setAlarms).catch(e => console.warn(e)); }, [companyId]);
  useEffect(() => { syncSnapshots(companyId).catch(e => console.warn(e)); }, [companyId]);
  useEffect(() => { if (tab === "home" || tab === "alarmi") reloadAlarms(); }, [tab, reloadAlarms]);
  const low = alarms.filter(a => a.low);
  const tabs = ["home", "stock", "alarmi", "ulaz", "izlaz", "prenos", ...(role !== "rukovodilac" ? ["popis"] : []), "istorija", "izvestaj", "items", "locations", ...(role === "admin" ? ["users"] : [])];
  const banner = low.length > 0 && tab !== "alarmi" ? (
    <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderColor: low.some(a => !a.nabavka) ? "var(--color-danger)" : "var(--color-warning, #f5a623)" }}>
      <span>⚠️ {t("alBanner", { n: low.length })}</span><button type="button" onClick={() => setTab("alarmi")}>{t("alView")}</button></div>) : null;
  return (
    <Shell menu={tabs.map(k => ({ key: k, icon: ICON[k], label: t("nav_" + k), badge: k === "alarmi" ? low.length : undefined }))} banner={banner} active={tab} onSelect={setTab}
      eyebrow={company.name} title={t("nav_" + tab)} name={me.name} pill={t("role_" + role)} onProfile={() => setTab("profile")}>
      {tab === "home" && <Home companyId={companyId} role={role} go={setTab} />}
      {tab === "profile" && <Profile user={user} kind="member" role={role} companyId={companyId} company={company} onChanged={onChanged} />}
      {tab === "stock" && <Stock companyId={companyId} />}
      {tab === "alarmi" && <Alarmi companyId={companyId} role={role} alarms={alarms} reload={reloadAlarms} />}
      {tab === "istorija" && <Istorija companyId={companyId} />}
      {tab === "izvestaj" && <Izvestaj companyId={companyId} companyName={company.name} me={me.name} />}
      {tab === "popis" && <Popis companyId={companyId} role={role} me={me} />}
      {(tab === "ulaz" || tab === "izlaz" || tab === "prenos") && <Entry key={tab} companyId={companyId} role={role} type={tab} me={me} />}
      {tab === "items" && <Items companyId={companyId} role={role} />}
      {tab === "locations" && <Locations companyId={companyId} role={role} regNames={company.warehouses ?? []} />}
      {tab === "users" && role === "admin" && <UsersAdmin companyId={companyId} />}
    </Shell>
  );
}
