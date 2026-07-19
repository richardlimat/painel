/**
 * Taxonomia das PÁGINAS do perfil de pessoa (visão em tela cheia). Agrupa as
 * chaves de nível superior de `SERVICE_RESPONSE` (APIFull) nas 8 páginas
 * nomeadas pedidas pelo produto, na ordem definida abaixo. A última página,
 * "Saúde & Outros", é também o catch-all: qualquer chave que não bata com
 * nenhuma outra página cai nela — nenhuma chave é descartada, mesmo uma
 * nova/desconhecida introduzida futuramente pela API.
 *
 * Classificação por palavra-chave normalizada (minúsculo, sem acento, sem
 * separador) por substring contra o nome da chave — mesmo estilo de
 * `src/lib/profileCategories.ts`. As páginas são avaliadas na ordem do array;
 * a primeira que casar vence, então páginas mais específicas vêm antes.
 */

export interface ProfilePageDef {
  /** Rótulo exibido na aba, exatamente como o produto pediu. */
  name: string;
  keywords: string[];
}

export const SAUDE_E_OUTROS = 'Saúde & Outros';

const PAGE_DEFS: ProfilePageDef[] = [
  {
    name: 'Cyber Sec & Vazamentos',
    keywords: [
      'vazamento',
      'vazamentos',
      'vazad',
      'credenciaisvazadas',
      'credencial',
      'credenciais',
      'credenc',
      'senha',
      'senhas',
      'hash',
      'breach',
      'leak',
      'darkweb',
      'cyber',
      'seguranca',
    ],
  },
  {
    name: 'Contatos & Endereços',
    keywords: [
      'telefone',
      'telefones',
      'celular',
      'whatsapp',
      'email',
      'emails',
      'endereco',
      'enderecos',
      'contato',
      'contatos',
      'cep',
      'logradouro',
    ],
  },
  {
    name: 'Financeiro & Consumo',
    keywords: [
      'financeiro',
      'renda',
      'rendimento',
      'salario',
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
      'credito',
      'cartao',
      'divida',
      'dividas',
      'protesto',
      'protestos',
      'restricao',
      'restricoes',
      'consumo',
      'compras',
      'fatura',
      'gasto',
      'poder',
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
      'cnpj',
      'emprego',
      'empregos',
      'profissao',
      'profissional',
      'ocupacao',
      'cargo',
      'trabalho',
      'vinculo',
      'negocio',
      'negocios',
      'politica',
      'politico',
      'pep',
      'exposicaopublica',
      'cargopublico',
      'doacao',
      'doacoes',
      'eleitoral',
    ],
  },
  {
    name: 'Presença & Viagens',
    keywords: [
      'viagem',
      'viagens',
      'voo',
      'voos',
      'passagem',
      'passagens',
      'hotel',
      'hospedagem',
      'hospedagens',
      'imigracao',
      'fronteira',
      'embarque',
      'deslocamento',
      'presenca',
      'localizacao',
      'geolocalizacao',
    ],
  },
  {
    name: 'Bens & Patrimônio',
    keywords: [
      'veiculo',
      'veiculos',
      'placa',
      'placas',
      'imovel',
      'imoveis',
      'patrimonio',
      'embarcacao',
      'embarcacoes',
      'aeronave',
      'aeronaves',
      'propriedade',
      'propriedades',
      'bem',
      'bens',
    ],
  },
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
      'idade',
      'sexo',
      'genero',
      'estadocivil',
      'nomemae',
      'nomepai',
      'filiacao',
      'naturalidade',
      'nacionalidade',
      'obito',
      'documento',
      'documentos',
      'rg',
      'cns',
      'pis',
      'pasep',
      'titulo',
      'ctps',
      'passaporte',
      'docsbase64',
      'docbase64',
      'parente',
      'parentes',
      'familiar',
      'familiares',
      'conjuge',
      'filho',
      'filhos',
      'irmao',
      'relacionado',
      'relacionados',
      'foto',
      'fotos',
      'imagem',
      'imagens',
      'selfie',
      'escolaridade',
      'educacao',
      'formacao',
      'curso',
      'cursos',
      'graduacao',
      'faculdade',
    ],
  },
];

function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function pageFor(key: string): string {
  const normalized = normalizeKey(key);
  for (const def of PAGE_DEFS) {
    if (def.keywords.some((kw) => normalized.includes(kw))) return def.name;
  }
  return SAUDE_E_OUTROS;
}

export interface ProfilePageGroup {
  name: string;
  entries: [string, unknown][];
}

/** Ordem final das abas, exatamente como o produto pediu. */
export const PROFILE_PAGE_ORDER: string[] = [
  'Cadastral & Civil',
  'Contatos & Endereços',
  'Financeiro & Consumo',
  'Carreira & Negócios',
  'Cyber Sec & Vazamentos',
  'Presença & Viagens',
  'Bens & Patrimônio',
  SAUDE_E_OUTROS,
];

/**
 * Agrupa as chaves de `serviceResponse` nas 8 páginas nomeadas, sempre
 * retornando as 8 (na ordem de `PROFILE_PAGE_ORDER`, mesmo as vazias — a UI
 * decide como exibir uma página sem dados).
 */
export function groupServiceResponseIntoPages(serviceResponse: Record<string, unknown>): ProfilePageGroup[] {
  const groups = new Map<string, [string, unknown][]>();
  for (const name of PROFILE_PAGE_ORDER) groups.set(name, []);

  for (const [key, value] of Object.entries(serviceResponse)) {
    groups.get(pageFor(key))!.push([key, value]);
  }

  return PROFILE_PAGE_ORDER.map((name) => ({ name, entries: groups.get(name)! }));
}
