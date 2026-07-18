import { useEffect, useState } from 'react';
import type { GraphNode } from '../../types/graph';
import { usePersonProfileStore } from '../../store/personProfileStore';
import { applyMask, classifyKey, type MaskClass } from '../../lib/mask';
import {
  MAX_RENDER_DEPTH,
  decodeBase64ToBlob,
  describePrimitive,
  formatApproxSize,
  isLikelyDocumentBlob,
  truncateItems,
} from '../../lib/profileRender';
import { CollapsibleSection } from './CollapsibleSection';

function countRecords(value: unknown): number | undefined {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object') return Object.keys(value).length;
  return undefined;
}

/**
 * Base64/documento grande: nunca renderizado como texto cru. Só decodifica
 * e cria um Blob URL quando o usuário clica em "Visualizar" — o URL é
 * revogado ao trocar de documento ou desmontar o painel, nunca persiste em
 * localStorage/sessionStorage.
 */
function DocumentValue({ base64 }: { base64: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <span className="profile-doc">
      <span>Documento disponível ({formatApproxSize(base64.length)})</span>
      <button
        type="button"
        className="btn plain"
        onClick={() => {
          const url = URL.createObjectURL(decodeBase64ToBlob(base64));
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          window.open(url, '_blank', 'noopener,noreferrer');
        }}
      >
        Visualizar
      </button>
    </span>
  );
}

/**
 * Campos "soft" mascaram por padrão com botão de revelar — isso é só
 * conveniência de UI, não controle de acesso (ver README/aviso de
 * segurança). Campos "hard" (credenciaisVazadas etc.) nunca mostram
 * `Revelar` — applyMask já garante isso independente do estado local.
 */
function MaskedValue({ value, cls }: { value: string; cls: MaskClass }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span className="profile-masked">
      <span>{applyMask(value, cls, revealed)}</span>
      {cls === 'soft' && (
        <button type="button" className="profile-reveal" onClick={() => setRevealed((r) => !r)}>
          {revealed ? 'Ocultar' : 'Revelar'}
        </button>
      )}
    </span>
  );
}

function RenderValue({ label, keyName, value, depth }: { label: string; keyName: string; value: unknown; depth: number }) {
  if (depth > MAX_RENDER_DEPTH) {
    return (
      <div className="profile-row">
        <span>{label}</span>
        <span className="profile-row-value">…</span>
      </div>
    );
  }

  if (typeof value === 'string' && isLikelyDocumentBlob(keyName, value)) {
    return (
      <div className="profile-row">
        <span>{label}</span>
        <DocumentValue base64={value} />
      </div>
    );
  }

  const cls = classifyKey(keyName);
  if (cls !== 'none' && typeof value === 'string' && value !== '') {
    return (
      <div className="profile-row">
        <span>{label}</span>
        <MaskedValue value={value} cls={cls} />
      </div>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="profile-row">
          <span>{label}</span>
          <span className="profile-row-value">Nenhum registro encontrado</span>
        </div>
      );
    }
    const { visible, hiddenCount } = truncateItems(value);
    return (
      <div className="profile-array">
        {visible.map((item, i) => (
          <div className="profile-array-item" key={i}>
            <RenderValue label={`#${i + 1}`} keyName={keyName} value={item} depth={depth + 1} />
          </div>
        ))}
        {hiddenCount > 0 && <p className="profile-more">+{hiddenCount} mais</p>}
      </div>
    );
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <div className="profile-row">
          <span>{label}</span>
          <span className="profile-row-value">Nenhum registro encontrado</span>
        </div>
      );
    }
    return (
      <div className="profile-object">
        {entries.map(([k, v]) => (
          <RenderValue key={k} label={k} keyName={k} value={v} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <div className="profile-row">
      <span>{label}</span>
      <span className="profile-row-value">{describePrimitive(value)}</span>
    </div>
  );
}

/**
 * Perfil completo da APIFull (Etapa 1): seções recolhíveis simples por
 * chave de SERVICE_RESPONSE, sem categorização/busca (Etapa 2). Carrega o
 * perfil ao selecionar a pessoa — não expande o grafo (isso só acontece ao
 * avançar de camada). `sociedades[]` aparece aqui só como leitura.
 */
export function PersonProfilePanel({ node }: { node: GraphNode }) {
  const cpf = node.person?.cpf ?? '';
  const loadProfile = usePersonProfileStore((s) => s.loadProfile);
  const profile = usePersonProfileStore((s) => s.profilesByCpf.get(cpf));
  const loading = usePersonProfileStore((s) => s.requestsByCpf.has(cpf));
  const error = usePersonProfileStore((s) => s.errorsByCpf.get(cpf));

  useEffect(() => {
    if (cpf) void loadProfile(cpf);
  }, [cpf, loadProfile]);

  if (!cpf) return null;

  const entries = profile ? Object.entries(profile.SERVICE_RESPONSE) : [];

  return (
    <div className="profile-panel">
      <h4 className="subheading" style={{ marginTop: 0 }}>
        Perfil completo
      </h4>
      {loading && <p className="profile-status">Carregando perfil…</p>}
      {!loading && error && (
        <p className="profile-status profile-error">
          <span>{error}</span>
          <button type="button" className="btn plain" onClick={() => void loadProfile(cpf)}>
            Tentar novamente
          </button>
        </p>
      )}
      {!loading && !error && profile && (
        <div className="profile-sections">
          {entries.length === 0 && <p className="profile-status">Nenhum dado retornado.</p>}
          {entries.map(([key, value]) => (
            <CollapsibleSection key={key} title={key} count={countRecords(value)}>
              <RenderValue label={key} keyName={key} value={value} depth={0} />
            </CollapsibleSection>
          ))}
        </div>
      )}
    </div>
  );
}
