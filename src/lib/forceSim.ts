import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

// ─── Configuração das forças (escala amigável 0–100 na interface) ─────────────

export interface ForceSettings {
  /** atração dos nós para o centro do mapa */
  center: number;
  /** o quanto os nós empurram uns aos outros */
  repulsion: number;
  /** influência das conexões no posicionamento */
  linkStrength: number;
  /** distância desejada entre nós conectados */
  linkDistance: number;
}

export const FORCE_DEFAULTS: ForceSettings = {
  center: 50,
  repulsion: 50,
  linkStrength: 50,
  linkDistance: 50,
};

export const FORCE_STORAGE_KEY = 'painel-forcas';

export function loadForceSettings(): { settings: ForceSettings; customized: boolean } {
  try {
    const raw = localStorage.getItem(FORCE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ForceSettings>;
      return { settings: { ...FORCE_DEFAULTS, ...parsed }, customized: true };
    }
  } catch {
    /* localStorage indisponível ou corrompido — usa padrões */
  }
  return { settings: { ...FORCE_DEFAULTS }, customized: false };
}

export function saveForceSettings(s: ForceSettings) {
  try {
    localStorage.setItem(FORCE_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignora */
  }
}

export function clearForceSettings() {
  try {
    localStorage.removeItem(FORCE_STORAGE_KEY);
  } catch {
    /* ignora */
  }
}

// ─── Conversão escala UI (0–100) → parâmetros do d3-force ─────────────────────

const centerStrength = (v: number) => (v / 100) * 0.12;
const repulsionStrength = (v: number) => -(40 + v * 9);
const linkStrengthValue = (v: number) => (v / 100) * 1;
const linkDistanceValue = (v: number) => 80 + v * 3.6; // 50 → 260, na faixa do layout radial atual

// ─── Refinador de posições ────────────────────────────────────────────────────

export interface SimNode extends SimulationNodeDatum {
  id: string;
  /** raio do círculo do nó (a colisão considera também o cartão de rótulo) */
  radius: number;
}

export interface SimLink extends SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

/**
 * Refinador de layout por simulação de forças (estilo Obsidian).
 * Atua sobre as posições já geradas pelo layout radial: atualiza apenas x/y,
 * nunca IDs, dados ou aparência dos nós. Uma instância roda por vez —
 * chame stop() antes de iniciar outra.
 */
export class ForceRefiner {
  private sim: Simulation<SimNode, SimLink> | null = null;

  constructor(
    private nodes: SimNode[],
    links: { source: string; target: string }[],
    private settings: ForceSettings,
  ) {
    const nodeIds = new Set(nodes.map((n) => n.id));
    this.links = links
      .filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target))
      .map((l) => ({ source: l.source, target: l.target }));
  }

  private links: SimLink[];

  start(onTick: (nodes: SimNode[]) => void, onEnd: () => void) {
    const s = this.settings;
    this.sim = forceSimulation<SimNode>(this.nodes)
      .force('charge', forceManyBody<SimNode>().strength(repulsionStrength(s.repulsion)))
      .force('x', forceX<SimNode>(0).strength(centerStrength(s.center)))
      .force('y', forceY<SimNode>(0).strength(centerStrength(s.center)))
      .force(
        'link',
        forceLink<SimNode, SimLink>(this.links)
          .id((d) => d.id)
          .strength(linkStrengthValue(s.linkStrength))
          .distance(linkDistanceValue(s.linkDistance)),
      )
      // colisão pelas dimensões reais do nó (círculo + cartão de rótulo ~150px):
      // impede sobreposição sem alterar tamanho ou formato dos elementos
      .force('collide', forceCollide<SimNode>().radius((d) => Math.max(80, d.radius + 55)).strength(0.9))
      .alpha(1)
      .alphaDecay(0.035)
      .velocityDecay(0.4)
      .on('tick', () => onTick(this.nodes))
      .on('end', () => {
        onEnd();
        this.sim = null;
      });
  }

  stop() {
    this.sim?.stop();
    this.sim = null;
  }

  get running() {
    return this.sim !== null;
  }
}
