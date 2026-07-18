import { useState } from 'react';
import { useGraphStore } from '../../store/graphStore';
import type { ForceSettings } from '../../lib/forceSim';

const SLIDERS: { key: keyof ForceSettings; label: string; tooltip: string }[] = [
  {
    key: 'center',
    label: 'Força centrípeta',
    tooltip: 'Atrai os nós para o centro. Maior: grafo mais concentrado; menor: mais espalhado.',
  },
  {
    key: 'repulsion',
    label: 'Força de repulsão',
    tooltip: 'O quanto os nós se empurram. Aumente para afastar elementos próximos ou sobrepostos.',
  },
  {
    key: 'linkStrength',
    label: 'Força dos links',
    tooltip: 'Influência das conexões. Maior: nós conectados são puxados com mais força; menor: mais liberdade.',
  },
  {
    key: 'linkDistance',
    label: 'Distância dos links',
    tooltip: 'Distância desejada entre nós conectados. Maior: conexões longas; menor: grafo compacto.',
  },
];

/**
 * Botão "⚙ Configurar mapa" + painel retrátil de forças (estilo Obsidian),
 * flutuante no canto superior esquerdo do canvas, abaixo do controle de camadas.
 */
export function MapConfig() {
  const forceSettings = useGraphStore((s) => s.forceSettings);
  const setForceSettings = useGraphStore((s) => s.setForceSettings);
  const resetForceSettings = useGraphStore((s) => s.resetForceSettings);
  const requestAnimate = useGraphStore((s) => s.requestAnimate);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="map-config-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Ajustar forças e espaçamento do mapa"
      >
        ⚙ Configurar mapa
      </button>
      {open && (
        <div className="map-config-panel" role="dialog" aria-label="Configuração do mapa">
          <div className="map-config-head">
            <b>Configuração do mapa</b>
            <button className="map-config-close" onClick={() => setOpen(false)} aria-label="Fechar configuração">
              ×
            </button>
          </div>
          <div className="map-config-section">Forças</div>
          {SLIDERS.map(({ key, label, tooltip }) => (
            <div className="force-row" key={key} title={tooltip}>
              <div className="force-label">
                <span>{label}</span>
                <b>{forceSettings[key]}</b>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={forceSettings[key]}
                onChange={(e) => setForceSettings({ [key]: Number(e.target.value) })}
                aria-label={label}
              />
            </div>
          ))}
          <div className="map-config-actions">
            <button className="map-config-reset" onClick={resetForceSettings} title="Volta aos valores padrão e limpa a preferência salva">
              Restaurar padrão
            </button>
            <button className="map-config-animate" onClick={requestAnimate} title="Reorganiza o grafo com os valores atuais">
              Animar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
