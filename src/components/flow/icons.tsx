/** Ícones do painel (prédio e pessoa) */

export function CompanyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 42V16L25 7v35M25 18h14v24M4 42h40" />
        <path d="M14 19h4M14 25h4M14 31h4M14 37h4M30 24h4M30 30h4M30 36h4" />
      </g>
    </svg>
  );
}

export function PersonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M4 21c0-5 3.5-8 8-8s8 3 8 8" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
