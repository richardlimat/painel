import { useState, type ReactNode } from 'react';

/**
 * Accordion simples (uma seção recolhível, reaproveitado tanto pra categoria
 * quanto pra chave dentro dela — Etapa 2). Recolhida por padrão.
 * `forceOpen` (busca) abre a seção sem descartar o estado manual do usuário
 * — ao limpar a busca, a seção volta a obedecer o último toggle manual.
 */
export function CollapsibleSection({
  title,
  count,
  forceOpen,
  children,
}: {
  title: ReactNode;
  count?: number;
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  return (
    <div className="profile-section">
      <button
        type="button"
        className="profile-section-header"
        aria-expanded={isOpen}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`profile-section-caret ${isOpen ? 'open' : ''}`}>▸</span>
        <span className="profile-section-title">{title}</span>
        {count != null && <span className="profile-section-count">{count}</span>}
      </button>
      {isOpen && <div className="profile-section-body">{children}</div>}
    </div>
  );
}
