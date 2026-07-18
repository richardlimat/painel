/**
 * Taxonomia de categorias do painel de pessoa (Etapa 2). Agrupa as chaves de
 * nível superior de `SERVICE_RESPONSE` (APIFull) em 14 categorias nomeadas,
 * na ordem definida abaixo; qualquer chave que não bata com nenhuma
 * categoria cai no grupo sintético final "Outros dados" — nenhuma chave é
 * descartada, mesmo uma nova/desconhecida introduzida futuramente pela API.
 *
 * Classificação por palavra-chave normalizada (minúsculo, sem acento, sem
 * separador) contra o nome da chave — mesmo estilo de `src/lib/mask.ts`,
 * mas aqui é só agrupamento visual, não mascaramento.
 */

interface CategoryDef {
  name: string;
  keywords: string[];
}

export const OUTROS_DADOS = 'Outros dados';

const CATEGORY_DEFS: CategoryDef[] = [
  {
    name: 'Resumo cadastral',
    keywords: [
      'cadastral',
      'cadastro',
      'resumo',
      'dadospessoais',
      'identificacao',
      'nome',
      'nascimento',
      'idade',
      'sexo',
      'genero',
      'estadocivil',
      'nomemae',
      'nomepai',
      'filiacao',
    ],
  },
  {
    name: 'Documentos',
    keywords: ['documento', 'documentos', 'cpf', 'rg', 'cns', 'pis', 'pasep', 'tituloeleitor', 'ctps', 'passaporte', 'docsbase64', 'docbase64'],
  },
  {
    name: 'Contatos e endereços',
    keywords: ['telefone', 'telefones', 'email', 'emails', 'endereco', 'enderecos', 'contato', 'contatos', 'cep', 'logradouro'],
  },
  {
    name: 'Familiares e relacionados',
    keywords: ['parente', 'parentes', 'familiar', 'familiares', 'conjuge', 'filho', 'filhos', 'relacionado', 'relacionados'],
  },
  {
    name: 'Sociedades e atividade profissional',
    keywords: [
      'sociedade',
      'sociedades',
      'socio',
      'socios',
      'empresa',
      'empresas',
      'emprego',
      'empregos',
      'profissao',
      'profissional',
      'cargo',
      'vinculoempregaticio',
    ],
  },
  {
    name: 'Histórico e linha do tempo',
    keywords: ['historico', 'linhadotempo', 'timeline', 'evento', 'eventos'],
  },
  {
    name: 'Financeiro e patrimônio',
    keywords: [
      'financeiro',
      'patrimonio',
      'renda',
      'rendimento',
      'contabancaria',
      'contasbanco',
      'contasbancos',
      'contasbancarias',
      'chavespix',
      'pix',
      'banco',
      'bancos',
      'investimento',
      'investimentos',
      'score',
      'scorecredito',
    ],
  },
  {
    name: 'Jurídico e compliance',
    keywords: ['processo', 'processos', 'juridico', 'judicial', 'compliance', 'antecedente', 'antecedentes', 'protesto', 'protestos', 'divida', 'dividas', 'restricao', 'restricoes'],
  },
  {
    name: 'Política e exposição pública',
    keywords: ['politica', 'politico', 'pep', 'exposicaopublica', 'cargopublico', 'doacao', 'doacoes', 'eleitoral'],
  },
  {
    name: 'Saúde e benefícios',
    keywords: ['saude', 'beneficio', 'beneficios', 'inss', 'planosaude', 'vacina', 'vacinas'],
  },
  {
    name: 'Educação',
    keywords: ['educacao', 'escolaridade', 'formacao', 'curso', 'cursos', 'graduacao', 'faculdade'],
  },
  {
    name: 'Veículos/imóveis e outros bens',
    keywords: ['veiculo', 'veiculos', 'placa', 'placas', 'imovel', 'imoveis', 'bem', 'bens'],
  },
  {
    name: 'Segurança digital e vazamentos',
    keywords: ['vazamento', 'vazamentos', 'credenciaisvazadas', 'credencial', 'credenciais', 'senha', 'senhas', 'hash', 'breach', 'seguranca'],
  },
  {
    name: 'Fotos e documentos',
    keywords: ['foto', 'fotos', 'imagem', 'imagens', 'selfie', 'fotografia'],
  },
];

function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function categoryFor(key: string): string {
  const normalized = normalizeKey(key);
  for (const def of CATEGORY_DEFS) {
    if (def.keywords.some((kw) => normalized.includes(kw))) return def.name;
  }
  return OUTROS_DADOS;
}

export interface ProfileCategoryGroup {
  name: string;
  entries: [string, unknown][];
}

/**
 * Agrupa as chaves de `serviceResponse` nas 14 categorias nomeadas (nessa
 * ordem) + "Outros dados" ao final. Sempre retorna os 15 grupos, mesmo
 * vazios (o painel decide como exibir um grupo sem entradas).
 */
export function groupServiceResponse(serviceResponse: Record<string, unknown>): ProfileCategoryGroup[] {
  const groups = new Map<string, [string, unknown][]>();
  for (const def of CATEGORY_DEFS) groups.set(def.name, []);
  groups.set(OUTROS_DADOS, []);

  for (const [key, value] of Object.entries(serviceResponse)) {
    const category = categoryFor(key);
    groups.get(category)!.push([key, value]);
  }

  return [...CATEGORY_DEFS.map((d) => d.name), OUTROS_DADOS].map((name) => ({ name, entries: groups.get(name)! }));
}
