import { useState, type ReactNode } from 'react';

/**
 * Accordion simples (uma seção por chave) — Etapa 1 do painel de pessoa.
 * Sem categorização em grupos nem busca (Etapa 2). Recolhida por padrão.
 */
export function CollapsibleSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="profile-section">
      <button type="button" className="profile-section-header" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`profile-section-caret ${open ? 'open' : ''}`}>▸</span>
        <span className="profile-section-title">{title}</span>
        {count != null && <span className="profile-section-count">{count}</span>}
      </button>
      {open && <div className="profile-section-body">{children}</div>}
    </div>
  );
}
