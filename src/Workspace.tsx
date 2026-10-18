import { useState } from "react";
import { useTranslation } from "react-i18next";
import Items from "./Items";
import Locations from "./Locations";
import UsersAdmin from "./UsersAdmin";
import Stock from "./Stock";
import Popis from "./Popis";
import Entry from "./Entry";
import type { Me } from "./lib";

export default function Workspace({ companyId, role, company, me }: { companyId: string; role: string; company: { name: string; warehouses?: string[] }; me: Me }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("home");
  const tabs = ["home", "stock", "ulaz", "izlaz", "prenos", ...(role !== "rukovodilac" ? ["popis"] : []), "items", "locations", ...(role === "admin" ? ["users"] : [])];
  return (
    <>
      <nav className="tabs">
        {tabs.map(k => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t("nav_" + k)}</button>)}
      </nav>
      {tab === "home" && (
        <section className="card wide"><h1>{t("homeTitle")}</h1>
          <p>{t("homeText", { name: company.name })}</p>
          <p className="hint">{me.name} · {t("yourRole")}: {t("role_" + role)}</p></section>
      )}
      {tab === "stock" && <Stock companyId={companyId} />}
      {tab === "popis" && <Popis companyId={companyId} role={role} me={me} />}
      {(tab === "ulaz" || tab === "izlaz" || tab === "prenos") && <Entry key={tab} companyId={companyId} role={role} type={tab} me={me} />}
      {tab === "items" && <Items companyId={companyId} role={role} />}
      {tab === "locations" && <Locations companyId={companyId} role={role} regNames={company.warehouses ?? []} />}
      {tab === "users" && role === "admin" && <UsersAdmin companyId={companyId} />}
    </>
  );
}
