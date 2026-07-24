import { useMemo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { SectionSpec } from '../../lib/profileSchema';
import { fmtDate, fmtText, isEmptyValue } from '../../lib/profileFormat';
import { MaskedValue, ProfileCardEntries, countRecords } from './ProfileValue';
import { ProfileSectionView, sectionHasContent } from './ProfileSections';

/**
 * Aba "Cyber Sec & Vazamentos": uma central de ameaças. No topo, um console
 * escuro com o nível de exposição calculado e as métricas de vazamento. No
 * corpo, cada alvo comprometido (e-mail/usuário) vira um painel com seus
 * "breaches" — fonte, login e senha (mascarados, reveláveis) e data, além de
 * um indicador de força da senha derivado SEM revelá-la.
 *
 * NADA é omitido — pelo contrário, é mais completo que o renderizador antigo:
 * além de tipo/valor/host/url/login/senha/data, exibe TODA chave não prevista
 * do alvo e de cada breach via `ProfileCardEntries` (mesmo mascaramento). A
 * seção "Outros vazamentos" segue no `ProfileSectionView`.
 */

const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : [];

const num = (v: unknown): number => countRecords(v) ?? (isEmptyValue(v) ? 0 : 1);

function parseYear(v: unknown): number | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const iso = v.match(/(\d{4})/);
  return iso ? Number(iso[1]) : null;
}

const BREACH_KEYS = new Set(['host', 'url', 'login', 'password', 'file_date']);
const IDENTITY_KEYS = new Set(['tipo', 'valor', 'resultados']);

function restOf(item: Record<string, unknown>, skip: Set<string>): [string, unknown][] {
  return Object.entries(item).filter(([k]) => !skip.has(k));
}

/** Força da senha derivada do texto cru — SEM exibir a senha (só metadados). */
function passwordStrength(pw: string): { len: number; label: string; tone: string } | null {
  if (!pw || pw === '—') return null;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const label = score <= 1 ? 'fraca' : score <= 3 ? 'média' : 'forte';
  const tone = score <= 1 ? 'weak' : score <= 3 ? 'mid' : 'strong';
  return { len: pw.length, label, tone };
}

const I = {
  shield: (<><path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3Z" /><path d="M9.5 12.5 11 14l3.5-3.5" /></>),
  alert: (<><path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3Z" /><path d="M12 8v4M12 16h.01" /></>),
  fingerprint: (<><path d="M12 11a2 2 0 0 0-2 2c0 3-1 5-1 5M12 7a6 6 0 0 0-6 6c0 1 0 2-.5 3.5M12 4a9 9 0 0 0-9 9M15.5 20c.5-1.5.5-3 .5-4a4 4 0 0 0-4-4M20 15c.5-2 .5-4-.5-6" /></>),
  db: (<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>),
  key: (<><circle cx="8" cy="15" r="4" /><path d="M11 12 20 3M17 6l2 2M15 8l2 2" /></>),
  globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  mail: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6 8.5-6" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" /></>),
};

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function BreachRow({ res }: { res: Record<string, unknown> }) {
  const host = fmtText(res.host ?? res.url);
  const url = fmtText(res.url);
  const pw = fmtText(res.password);
  const strength = passwordStrength(pw);
  const rest = restOf(res, BREACH_KEYS);

  return (
    <div className="cy-breach">
      <div className="cy-breach-source">
        <span className="cy-breach-globe"><Svg size={15}>{I.globe}</Svg></span>
        <span className="cy-breach-host">
          {host}
          {url !== '—' && url !== host && <small>{url}</small>}
        </span>
        <time className="cy-breach-date">{fmtDate(res.file_date)}</time>
      </div>
      <div className="cy-breach-creds">
        <div className="cy-cred">
          <small>Login</small>
          <span className="cy-mono"><MaskedValue value={fmtText(res.login)} cls="soft" /></span>
        </div>
        <div className="cy-cred">
          <small>Senha</small>
          <span className="cy-pass cy-mono"><MaskedValue value={pw} cls="soft" /></span>
          {strength && <span className={`cy-strength tone-${strength.tone}`}>{strength.len} caract. · {strength.label}</span>}
        </div>
      </div>
      {rest.length > 0 && (
        <div className="cy-extra">
          <ProfileCardEntries entries={rest} query="" onOpenImage={() => {}} />
        </div>
      )}
    </div>
  );
}

function BreachIdentity({ item, onOpenImage }: { item: Record<string, unknown>; onOpenImage: (u: string) => void }) {
  const tipo = fmtText(item.tipo);
  const valor = fmtText(item.valor);
  const resultados = arr(item.resultados);
  const isEmail = /mail/i.test(tipo) || valor.includes('@');
  const skip = new Set(IDENTITY_KEYS);
  if (!Array.isArray(item.resultados)) skip.delete('resultados'); // se não for lista, não perder
  const rest = restOf(item, skip);

  return (
    <div className="cy-identity">
      <header className="cy-identity-head">
        <span className="cy-identity-icon"><Svg size={18}>{isEmail ? I.mail : I.user}</Svg></span>
        <div className="cy-identity-text">
          <span className="cy-identity-type">{tipo}</span>
          <strong className="cy-identity-value">{valor}</strong>
        </div>
        <span className="cy-identity-badge">
          <Svg size={12}>{I.alert}</Svg>
          {resultados.length} {resultados.length === 1 ? 'vazamento' : 'vazamentos'}
        </span>
      </header>
      {resultados.length > 0 && (
        <div className="cy-breaches">
          {resultados.map((r, j) => <BreachRow res={r} key={j} />)}
        </div>
      )}
      {rest.length > 0 && (
        <div className="cy-extra cy-identity-extra">
          <ProfileCardEntries entries={rest} query="" onOpenImage={onOpenImage} />
        </div>
      )}
    </div>
  );
}

export function CyberPage({
  sections,
  serviceResponse,
  onOpenImage,
  onConsult,
}: {
  sections: SectionSpec[];
  serviceResponse: Record<string, unknown>;
  onOpenImage: (url: string) => void;
  onConsult: (cpf: string) => void;
}) {
  const sr = serviceResponse;
  const bySource = (src: string) => sections.find((s) => s.source === src);

  const stats = useMemo(() => {
    const identities = arr(sr.credenciaisVazadas);
    let breaches = 0;
    let passwords = 0;
    const hosts = new Set<string>();
    const years: number[] = [];
    for (const id of identities) {
      for (const r of arr(id.resultados)) {
        breaches++;
        if (!isEmptyValue(r.password)) passwords++;
        const h = fmtText(r.host ?? r.url);
        if (h !== '—') hosts.add(h.replace(/^https?:\/\//, '').split('/')[0]);
        const y = parseYear(typeof r.file_date === 'string' ? r.file_date : undefined);
        if (y) years.push(y);
      }
    }
    return {
      identities: identities.length,
      breaches,
      passwords,
      sources: hosts.size,
      outros: num(sr.vazamentos),
      minYear: years.length ? Math.min(...years) : null,
      maxYear: years.length ? Math.max(...years) : null,
    };
  }, [sr]);

  const totalExposure = stats.breaches + stats.outros;
  const level = totalExposure === 0 ? 'safe' : stats.breaches >= 6 ? 'critical' : 'exposed';
  const verdict = {
    safe: { title: 'Sem vazamentos conhecidos', sub: 'Nenhuma credencial ou vazamento localizado para esta pessoa' },
    exposed: { title: 'Exposição detectada', sub: `${stats.breaches} credencial(is) vazada(s) — revise e force a troca de senhas` },
    critical: { title: 'Exposição crítica', sub: `${stats.breaches} vazamentos em ${stats.sources} fonte(s) — risco elevado de sequestro de conta` },
  }[level];

  const metrics = [
    { icon: I.fingerprint, value: stats.identities, label: 'identidades', tone: stats.identities ? 'info' : 'muted' },
    { icon: I.db, value: stats.breaches, label: 'registros vazados', tone: stats.breaches ? 'risk' : 'muted' },
    { icon: I.key, value: stats.passwords, label: 'senhas expostas', tone: stats.passwords ? 'risk' : 'muted' },
    { icon: I.globe, value: stats.sources, label: 'fontes', tone: stats.sources ? 'info' : 'muted' },
    { icon: I.alert, value: stats.outros, label: 'outros vazamentos', tone: stats.outros ? 'warn' : 'muted' },
    { icon: I.clock, value: stats.minYear ? (stats.minYear === stats.maxYear ? `${stats.minYear}` : `${stats.minYear}–${stats.maxYear}`) : '—', label: 'período', tone: 'info' },
  ];

  const identities = arr(sr.credenciaisVazadas);
  const vazamentosSpec = bySource('vazamentos');
  const showVazamentos = vazamentosSpec && (vazamentosSpec.alwaysShow || sectionHasContent(vazamentosSpec, sr));

  return (
    <div className="cy">
      {/* Console de ameaças */}
      <div className="cy-console">
        <div className={`cy-verdict tone-${level}`}>
          <span className="cy-verdict-badge"><Svg size={26}>{level === 'safe' ? I.shield : I.alert}</Svg></span>
          <div className="cy-verdict-text">
            <b>{verdict.title}</b>
            <small>{verdict.sub}</small>
          </div>
        </div>
        <div className="cy-metrics">
          {metrics.map((m, i) => (
            <div className={`cy-metric tone-${m.tone}`} key={i}>
              <span className="cy-metric-icon"><Svg size={15}>{m.icon}</Svg></span>
              <span className="cy-metric-value">{m.value}</span>
              <span className="cy-metric-label">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Credenciais vazadas */}
      <section className="cy-section">
        <header className="cy-section-head">
          <h2 className="cy-section-title">Credenciais vazadas</h2>
          <p className="cy-section-sub">Alvos comprometidos e onde os dados apareceram</p>
        </header>
        {identities.length === 0 ? (
          <div className="cy-clear">
            <span className="cy-clear-icon"><Svg size={22}>{I.shield}</Svg></span>
            <p className="cy-clear-title">Nenhuma credencial vazada encontrada</p>
            <p className="cy-clear-sub">Não localizamos vazamentos de login/senha vinculados a esta pessoa.</p>
          </div>
        ) : (
          <div className="cy-identities">
            {identities.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min(i * 0.05, 0.25) }}
              >
                <BreachIdentity item={item} onOpenImage={onOpenImage} />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Outros vazamentos */}
      {showVazamentos && (
        <section className="cy-domain">
          <header className="cy-domain-head">
            <h2 className="cy-domain-title">Outros vazamentos</h2>
            <p className="cy-domain-sub">Exposições adicionais fora do formato de credenciais</p>
          </header>
          <div className="cy-domain-body">
            <ProfileSectionView spec={vazamentosSpec!} serviceResponse={sr} query="" onOpenImage={onOpenImage} onConsult={onConsult} />
          </div>
        </section>
      )}
    </div>
  );
}
