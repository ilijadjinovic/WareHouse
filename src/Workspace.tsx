import { useState } from "react";
import { useTranslation } from "react-i18next";
import Items from "./Items";
import Locations from "./Locations";
import UsersAdmin from "./UsersAdmin";
import Stock from "./Stock";
import Popis from "./Popis";
import Entry from "./Entry";
import Home from "./Home";
import Profile, { type CompanyDoc } from "./Profile";
import { Shell } from "./Shell";
import type { Me } from "./lib";
import type { User } from "firebase/auth";

const ICON: Record<string, string> = { home: "🏠", stock: "📦", ulaz: "⬇️", izlaz: "⬆️", prenos: "🔁", popis: "📋", items: "🏷️", locations: "🏭", users: "👥" };

export default function Workspace({ companyId, role, company, me, user, onChanged }: { companyId: string; role: string; company: CompanyDoc; me: Me; user: User; onChanged: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("home");
  const tabs = ["home", "stock", "ulaz", "izlaz", "prenos", ...(role !== "rukovodilac" ? ["popis"] : []), "items", "locations", ...(role === "admin" ? ["users"] : [])];
  return (
    <Shell menu={tabs.map(k => ({ key: k, icon: ICON[k], label: t("nav_" + k) }))} active={tab} onSelect={setTab}
      eyebrow={company.name} title={t("nav_" + tab)} name={me.name} pill={t("role_" + role)} onProfile={() => setTab("profile")}>
      {tab === "home" && <Home companyId={companyId} role={role} go={setTab} />}
      {tab === "profile" && <Profile user={user} kind="member" role={role} companyId={companyId} company={company} onChanged={onChanged} />}
      {tab === "stock" && <Stock companyId={companyId} />}
      {tab === "popis" && <Popis companyId={companyId} role={role} me={me} />}
      {(tab === "ulaz" || tab === "izlaz" || tab === "prenos") && <Entry key={tab} companyId={companyId} role={role} type={tab} me={me} />}
      {tab === "items" && <Items companyId={companyId} role={role} />}
      {tab === "locations" && <Locations companyId={companyId} role={role} regNames={company.warehouses ?? []} />}
      {tab === "users" && role === "admin" && <UsersAdmin companyId={companyId} />}
    </Shell>
  );
}
