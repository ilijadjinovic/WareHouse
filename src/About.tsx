import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export const APP_VERSION = "1.0";

export default function About({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>{t("aboutTitle")}</h3><button className="icon-btn" aria-label="✕" onClick={onClose}>✕</button></div>
        <div className="about-author">
          <div className="about-avatar">ИЂ</div>
          <div><strong>Ilija Đinović, d.i.e.</strong><div className="hint">{t("aboutBy")}</div></div>
        </div>
        <hr className="about-sep" />
        <div className="about-list">
          <div className="about-row"><span className="about-icon">🧠</span><span>WareHouse v{APP_VERSION}</span></div>
          <div className="about-row"><span className="about-icon">🏢</span><span>Biro za veštačenja</span></div>
          <div className="about-row"><span className="about-icon">✉️</span><span>info@bzv.rs</span></div>
          <div className="about-row"><span className="about-icon">🌐</span><a href="https://www.bzv.rs" target="_blank" rel="noreferrer">www.bzv.rs</a></div>
          <div className="about-row"><span className="about-icon">📞</span><span>+381(0)62303303</span></div>
        </div>
      </div>
    </div>
  );
}
