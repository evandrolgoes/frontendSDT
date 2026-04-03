import { createPortal } from "react-dom";

export function InfoPopup({ open, title = "Informação", message, onClose }) {
  if (!open) {
    return null;
  }

  const content = (
    <div className="info-popup-backdrop" onClick={onClose}>
      <div className="info-popup-shell">
        <div className="info-popup-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
          <div className="info-popup-header">
            <div className="info-popup-title-group">
              <span className="info-popup-badge">Insight</span>
              <strong>{title}</strong>
            </div>
            <button type="button" className="info-popup-close" onClick={onClose} aria-label="Fechar informação">
              ×
            </button>
          </div>
          <div className="info-popup-body">{message}</div>
          <div className="info-popup-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}
