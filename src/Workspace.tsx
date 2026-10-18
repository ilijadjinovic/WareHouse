import { useState } from "react";
import { useTranslation } from "react-i18next";
import Items from "./Items";
import Locations from "./Locations";
import UsersAdmin from "./UsersAdmin";
import Stock from "./Stock";
import Popis from "./Popis";
import Entry from "./Entry";
import { Shell } from "./Shell";
import type { Me } from "./lib";

const ICON: Record<string, string> = { home: "🏠", stock: "📦", ulaz: "⬇️", izlaz: "⬆️", prenos: "🔁", popis: "📋", items: "🏷️", locations: "🏭", users: "👥" };

export default function Workspace({ companyId, role, company, me }: { companyId: string; role: string; company: { name: string; warehouses?: string[] }; me: Me }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("home");
  const tabs = ["home", "stock", "ulaz", "izlaz", "prenos", ...(role !== "rukovodilac" ? ["popis"] : []), "items", "locations", ...(role === "admin" ? ["users"] : [])];
  return (
    <Shell menu={tabs.map(k => ({ key: k, icon: ICON[k], label: t("nav_" + k) }))} active={tab} onSelect={setTab}
      eyebrow={company.name} title={t("nav_" + tab)} name={me.name} pill={t("role_" + role)}>
      {tab === "home" && (
        <section className="panel"><h2>{t("homeTitle")}</h2>
          <p>{t("homeText", { name: company.name })}</p>
          <p className="hint">{me.name} · {t("yourRole")}: {t("role_" + role)}</p></section>
      )}
      {tab === "stock" && <Stock companyId={companyId} />}
      {tab === "popis" && <Popis companyId={companyId} role={role} me={me} />}
      {(tab === "ulaz" || tab === "izlaz" || tab === "prenos") && <Entry key={tab} companyId={companyId} role={role} type={tab} me={me} />}
      {tab === "items" && <Items companyId={companyId} role={role} />}
      {tab === "locations" && <Locations companyId={companyId} role={role} regNames={company.warehouses ?? []} />}
      {tab === "users" && role === "admin" && <UsersAdmin companyId={companyId} />}
    </Shell>
  );
}
