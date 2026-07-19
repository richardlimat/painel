/**
 * Taxonomia de páginas do painel de detalhes em tela cheia. Agrupa as chaves
 * de nível superior de `SERVICE_RESPONSE` (APIFull, pessoas) — ou do objeto
 * sintético gerado a partir de `CompanyData` (empresas, ver
 * `companyToProfileSource`) — nas 8 páginas nomeadas abaixo, nessa ordem;
 * qualquer chave que não bata com nenhuma categoria cai no grupo final
 * "Saúde & Outros" — nenhuma chave é descartada, mesmo uma nova/desconhecida
 * introduzida futuramente pela API.
 *
 * Classificação por palavra-chave normalizada (minúsculo, sem acento, sem
 * separador) contra o nome da chave — mesmo estilo de `src/lib/mask.ts`,
 * mas aqui é só agrupamento visual, não mascaramento.
 */

import type { CompanyData } from '../types/graph';

interface CategoryDef {
  name: string;
  keywords: string[];
}

/** Nome do grupo catch-all — sempre o último da lista, nunca fica de fora. */
export const OUTROS_DADOS = 'Saúde & Outros';

const CATEGORY_DEFS: CategoryDef[] = [
  {
    name: 'Cadastral & Civil',
    keywords: [
      'cadastral',
      'cadastro',
      'resumo',
      'dadospessoais',
      'identificacao',
      'nome',
      'nascimento',
      'sexo',
      'genero',
      'estadocivil',
      'nomemae',
      'nomepai',
      'filiacao',
      'documento',
      'documentos',
      'identidade',
      'cpf',
      'cns',
      'pis',
      'pasep',
      'tituloeleitor',
      'ctps',
      'docsbase64',
      'docbase64',
      'parente',
      'parentes',
      'familiar',
      'familiares',
      'conjuge',
      'filho',
      'filhos',
      'relacionado',
      'relacionados',
      'foto',
      'fotos',
      'imagem',
      'imagens',
      'selfie',
      'fotografia',
      'historico',
      'linhadotempo',
      'timeline',
      'evento',
      'eventos',
      'naturezajuridica',
      'situacaocadastral',
      'matrizfilial',
    ],
  },
  {
    name: 'Contatos & Endereços',
    keywords: ['telefone', 'telefones', 'email', 'emails', 'endereco', 'enderecos', 'contato', 'contatos', 'cep', 'logradouro', 'municipio', 'uf'],
  },
  {
    name: 'Financeiro & Consumo',
    keywords: [
      'financeiro',
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
      'divida',
      'dividas',
      'protesto',
      'protestos',
      'restricao',
      'restricoes',
      'faturamento',
      'consumo',
      'capitalsocial',
    ],
  },
  {
    name: 'Carreira & Negócios',
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
      'educacao',
      'escolaridade',
      'formacao',
      'curso',
      'cursos',
      'graduacao',
      'faculdade',
      'processo',
      'processos',
      'juridico',
      'judicial',
      'compliance',
      'antecedente',
      'antecedentes',
      'cnae',
      'conexoes',
      'conexao',
    ],
  },
  {
    name: 'Cyber Sec & Vazamentos',
    keywords: ['vazamento', 'vazamentos', 'credenciaisvazadas', 'credencial', 'credenciais', 'senha', 'senhas', 'hash', 'breach', 'seguranca', 'cyber'],
  },
  {
    name: 'Presença & Viagens',
    keywords: [
      'passaporte',
      'viagem',
      'viagens',
      'voo',
      'voos',
      'aeroporto',
      'hospedagem',
      'hotel',
      'geolocalizacao',
      'localizacao',
      'presenca',
      'redesocial',
      'redessociais',
      'instagram',
      'facebook',
      'linkedin',
      'twitter',
      'tiktok',
      'siteweb',
      'dominio',
      'checkin',
    ],
  },
  {
    name: 'Bens & Patrimônio',
    keywords: ['veiculo', 'veiculos', 'placa', 'placas', 'imovel', 'imoveis', 'bem', 'bens', 'patrimonio'],
  },
  {
    name: 'Saúde & Outros',
    keywords: ['saude', 'beneficio', 'beneficios', 'inss', 'planosaude', 'vacina', 'vacinas', 'politica', 'politico', 'pep', 'exposicaopublica', 'doacao', 'doacoes', 'eleitoral'],
  },
];

/** Ordem fixa das 8 páginas — usada para renderizar as abas do painel em tela cheia. */
export const PROFILE_CATEGORY_NAMES = CATEGORY_DEFS.map((d) => d.name);

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
 * Agrupa as chaves de `serviceResponse` nas 8 páginas nomeadas (nessa ordem
 * — a última, "Saúde & Outros", também recebe qualquer chave desconhecida).
 * Sempre retorna os 8 grupos, mesmo vazios (o painel decide como exibir um
 * grupo sem entradas).
 */
export function groupServiceResponse(serviceResponse: Record<string, unknown>): ProfileCategoryGroup[] {
  const groups = new Map<string, [string, unknown][]>();
  for (const def of CATEGORY_DEFS) groups.set(def.name, []);

  for (const [key, value] of Object.entries(serviceResponse)) {
    const category = categoryFor(key);
    groups.get(category)!.push([key, value]);
  }

  return CATEGORY_DEFS.map((d) => ({ name: d.name, entries: groups.get(d.name)! }));
}

function pruneUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

/**
 * Empresas não têm um "perfil completo" tipo APIFull — só os campos
 * estruturados de `CompanyData` (FonteData). Para reaproveitar o mesmo
 * renderizador/categorização usado no perfil de pessoa, esses campos são
 * remapeados aqui num objeto sintético no mesmo formato de `SERVICE_RESPONSE`
 * (chaves conhecidas o bastante para caírem nas categorias certas).
 */
export function companyToProfileSource(company: CompanyData): Record<string, unknown> {
  const cadastral = pruneUndefined({
    razaoSocial: company.razaoSocial,
    nomeFantasia: company.nomeFantasia,
    cnpj: company.cnpj,
    naturezaJuridica: company.naturezaJuridica,
    situacaoCadastral: company.situacao,
    dataAbertura: company.dataAbertura,
    matrizFilial: company.matriz == null ? undefined : company.matriz ? 'Matriz' : 'Filial',
  });

  const contatos = pruneUndefined({
    endereco: company.endereco,
    municipio: company.municipio,
    uf: company.uf,
    telefone: company.telefone,
    email: company.email,
  });

  const financeiro = pruneUndefined({
    capitalSocial: company.capitalSocial,
  });

  const atividadeProfissional = pruneUndefined({
    cnaePrincipal: company.cnaePrincipal ? `${company.cnaePrincipal.codigo} — ${company.cnaePrincipal.descricao}` : undefined,
    cnaesSecundarios: company.cnaesSecundarios?.map((c) => `${c.codigo} — ${c.descricao}`),
  });

  const source: Record<string, unknown> = {};
  if (Object.keys(cadastral).length > 0) source.cadastral = cadastral;
  if (Object.keys(contatos).length > 0) source.contatos = contatos;
  if (Object.keys(financeiro).length > 0) source.financeiro = financeiro;
  if (Object.keys(atividadeProfissional).length > 0) source.atividadeProfissional = atividadeProfissional;
  return source;
}
