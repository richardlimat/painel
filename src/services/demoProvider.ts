import type {
  CompanyData,
  CompanyLookupResult,
  CompanyStatus,
  PartnerInfo,
  PersonData,
  PersonLookupResult,
  RelationType,
  RelationshipMeta,
} from '../types/graph';
import { onlyDigits } from '../lib/format';
import { DataProvider } from './provider';

// ─── PRNG determinístico ──────────────────────────────────────────────────────

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Vocabulário para geração de nomes ────────────────────────────────────────

const FIRST_NAMES = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nelson', 'Otávio', 'Paula', 'Rafael', 'Sofia', 'Thiago', 'Vanessa'];
const LAST_NAMES = ['Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Ferreira', 'Gomes', 'Lima', 'Martins', 'Nogueira', 'Oliveira', 'Pereira', 'Ribeiro', 'Santos', 'Teixeira', 'Vieira'];
const COMPANY_WORDS = ['Alfa', 'Beta', 'Horizonte', 'Atlântica', 'Nacional', 'Vale', 'Serra', 'Premium', 'Global', 'União', 'Delta', 'Primos', 'Central', 'Real', 'Nova Era', 'Ipiranga'];
const COMPANY_SECTORS = ['Comércio', 'Participações', 'Logística', 'Construções', 'Alimentos', 'Tecnologia', 'Agropecuária', 'Serviços', 'Incorporadora', 'Transportes'];
const SUFFIX = ['LTDA', 'S.A.', 'EIRELI', 'LTDA', 'LTDA'];
const CNAES = [
  { codigo: '4711301', descricao: 'Comércio varejista de mercadorias em geral' },
  { codigo: '6462000', descricao: 'Holdings de instituições não-financeiras' },
  { codigo: '4120400', descricao: 'Construção de edifícios' },
  { codigo: '4930202', descricao: 'Transporte rodoviário de carga' },
  { codigo: '6201501', descricao: 'Desenvolvimento de programas de computador' },
  { codigo: '1091102', descricao: 'Fabricação de produtos de padaria' },
  { codigo: '0151201', descricao: 'Criação de bovinos para corte' },
  { codigo: '6822600', descricao: 'Gestão e administração da propriedade imobiliária' },
];
const UFS = [
  { uf: 'SP', municipios: ['São Paulo', 'Campinas', 'Santos'] },
  { uf: 'RJ', municipios: ['Rio de Janeiro', 'Niterói'] },
  { uf: 'MG', municipios: ['Belo Horizonte', 'Uberlândia'] },
  { uf: 'PR', municipios: ['Curitiba', 'Londrina'] },
  { uf: 'BA', municipios: ['Salvador', 'Feira de Santana'] },
];
const QUALIFICACOES = ['Sócio', 'Sócio-Administrador', 'Sócio', 'Administrador', 'Sócio', 'Representante Legal'];

// Pool limitado de pessoas: colisões entre empresas criam conexões cruzadas
const PERSON_POOL_SIZE = 90;

function personFromPoolIndex(idx: number): PersonData {
  const rnd = mulberry32(hashString(`person-${idx}`));
  const nome = `${FIRST_NAMES[Math.floor(rnd() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)]} ${LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)]}`;
  const cpfDigits = String(Math.floor(rnd() * 1e9)).padStart(9, '0');
  const cpf = `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-${String(idx % 97).padStart(2, '0')}`;
  return { cpf, nome };
}

function makeCnpj(rnd: () => number): string {
  return String(Math.floor(rnd() * 1e12)).padStart(12, '0') + '01';
}

/**
 * Provedor de demonstração: gera uma rede societária sintética, determinística
 * e consistente (o mesmo CNPJ sempre produz a mesma estrutura). Suporta busca
 * reversa CPF → empresas, permitindo demonstrar a expansão em múltiplas
 * camadas sem depender de provedores comerciais.
 */
export class DemoProvider implements DataProvider {
  readonly name = 'Demonstração';

  /** fatos já gerados na sessão, para manter consistência bidirecional */
  private personCompanies = new Map<string, Map<string, { relation: RelationType; meta: RelationshipMeta }>>();
  private companyCache = new Map<string, CompanyLookupResult>();
  private personCache = new Map<string, PersonData>();

  private buildCompany(cnpj: string): CompanyData {
    const rnd = mulberry32(hashString(`company-${cnpj}`));
    const word = COMPANY_WORDS[Math.floor(rnd() * COMPANY_WORDS.length)];
    const sector = COMPANY_SECTORS[Math.floor(rnd() * COMPANY_SECTORS.length)];
    const suffix = SUFFIX[Math.floor(rnd() * SUFFIX.length)];
    const razao = `${word} ${sector} ${suffix}`;
    const statusRoll = rnd();
    const situacao: CompanyStatus = statusRoll < 0.72 ? 'ATIVA' : statusRoll < 0.85 ? 'BAIXADA' : statusRoll < 0.95 ? 'SUSPENSA' : 'INAPTA';
    const loc = UFS[Math.floor(rnd() * UFS.length)];
    const municipio = loc.municipios[Math.floor(rnd() * loc.municipios.length)];
    const year = 1990 + Math.floor(rnd() * 34);
    const month = 1 + Math.floor(rnd() * 12);
    const day = 1 + Math.floor(rnd() * 28);
    const isHolding = sector === 'Participações';
    return {
      cnpj,
      razaoSocial: razao,
      nomeFantasia: rnd() > 0.4 ? `${word} ${sector}` : undefined,
      situacao,
      cnaePrincipal: isHolding ? CNAES[1] : CNAES[Math.floor(rnd() * CNAES.length)],
      cnaesSecundarios: rnd() > 0.5 ? [CNAES[Math.floor(rnd() * CNAES.length)]] : [],
      naturezaJuridica: suffix === 'S.A.' ? '205-4 - Sociedade Anônima Fechada' : '206-2 - Sociedade Empresária Limitada',
      capitalSocial: Math.round(rnd() * rnd() * 5_000_000 + 10_000),
      dataAbertura: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      endereco: `Rua ${LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)]}, ${100 + Math.floor(rnd() * 900)}`,
      municipio,
      uf: loc.uf,
      telefone: `(${11 + Math.floor(rnd() * 80)}) 3${String(Math.floor(rnd() * 1e7)).padStart(7, '0')}`,
      email: rnd() > 0.5 ? `contato@${word.toLowerCase().replace(/\s/g, '')}${sector.toLowerCase().slice(0, 4)}.com.br` : undefined,
      matriz: rnd() > 0.15,
    };
  }

  private registerPersonCompany(personKey: string, cnpj: string, relation: RelationType, meta: RelationshipMeta) {
    let m = this.personCompanies.get(personKey);
    if (!m) {
      m = new Map();
      this.personCompanies.set(personKey, m);
    }
    if (!m.has(cnpj)) m.set(cnpj, { relation, meta });
  }

  async getCompany(rawCnpj: string): Promise<CompanyLookupResult> {
    const cnpj = onlyDigits(rawCnpj).padStart(14, '0');
    const cached = this.companyCache.get(cnpj);
    if (cached) return cached;

    await new Promise((r) => setTimeout(r, 150 + Math.random() * 250)); // latência simulada

    const company = this.buildCompany(cnpj);
    const rnd = mulberry32(hashString(`qsa-${cnpj}`));
    const partnerCount = 2 + Math.floor(rnd() * 4);
    const partners: PartnerInfo[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < partnerCount; i++) {
      const isPJ = rnd() < 0.14 && i > 0;
      const funcao = QUALIFICACOES[Math.floor(rnd() * QUALIFICACOES.length)];
      const relation: RelationType = isPJ
        ? rnd() < 0.4
          ? 'CONTROLADORA'
          : 'PARTICIPACAO'
        : funcao.includes('Administrador')
          ? 'ADMINISTRADOR'
          : funcao.includes('Representante')
            ? 'REPRESENTANTE_LEGAL'
            : 'SOCIO';
      const meta: RelationshipMeta = {
        percentual: Math.round((rnd() * 60 + 5) * 10) / 10,
        dataEntrada: `${2000 + Math.floor(rnd() * 24)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`,
        situacao: rnd() > 0.12 ? 'ATIVO' : 'RETIRADO',
        origem: 'Demonstração',
        funcao,
      };
      if (isPJ) {
        const pjCnpj = makeCnpj(rnd);
        if (seen.has(pjCnpj)) continue;
        seen.add(pjCnpj);
        const pj = this.buildCompany(pjCnpj);
        partners.push({ company: { cnpj: pjCnpj, razaoSocial: pj.razaoSocial }, relation, meta });
      } else {
        const poolIdx = Math.floor(rnd() * PERSON_POOL_SIZE);
        const person = this.getPerson(poolIdx, relation === 'ADMINISTRADOR');
        if (seen.has(person.cpf)) continue;
        seen.add(person.cpf);
        partners.push({ person, relation, meta });
        this.registerPersonCompany(person.cpf, cnpj, relation, meta);
      }
    }

    // filiais ocasionais
    const branches: CompanyLookupResult['branches'] = [];
    if (company.matriz && rnd() < 0.3) {
      const n = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const bCnpj = cnpj.slice(0, 8) + String(2 + i).padStart(4, '0') + cnpj.slice(12);
        branches.push({ cnpj: bCnpj, razaoSocial: company.razaoSocial, matriz: false });
      }
    }

    const result: CompanyLookupResult = { company, partners, branches };
    this.companyCache.set(cnpj, result);
    return result;
  }

  private getPerson(poolIdx: number, admin: boolean): PersonData {
    const base = personFromPoolIndex(poolIdx);
    const existing = this.personCache.get(base.cpf);
    if (existing) {
      if (admin) existing.administrador = true;
      return existing;
    }
    const p: PersonData = { ...base, administrador: admin };
    this.personCache.set(base.cpf, p);
    return p;
  }

  async getPersonCompanies(personId: string, personName: string): Promise<PersonLookupResult> {
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));

    const person = this.personCache.get(personId) ?? { cpf: personId, nome: personName };
    const rnd = mulberry32(hashString(`pc-${personId}`));
    const extraCount = 1 + Math.floor(rnd() * 3);

    // empresas adicionais determinísticas desta pessoa
    for (let i = 0; i < extraCount; i++) {
      const cnpj = makeCnpj(rnd);
      const funcao = QUALIFICACOES[Math.floor(rnd() * QUALIFICACOES.length)];
      const relation: RelationType = funcao.includes('Administrador') ? 'ADMINISTRADOR' : 'SOCIO';
      this.registerPersonCompany(personId, cnpj, relation, {
        percentual: Math.round((rnd() * 50 + 5) * 10) / 10,
        dataEntrada: `${2005 + Math.floor(rnd() * 19)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-15`,
        situacao: rnd() > 0.15 ? 'ATIVO' : 'RETIRADO',
        origem: 'Demonstração',
        funcao,
      });
    }

    const registered = this.personCompanies.get(personId) ?? new Map();
    const companies: PersonLookupResult['companies'] = [];
    for (const [cnpj, rel] of registered) {
      const c = this.companyCache.get(cnpj)?.company ?? this.buildCompany(cnpj);
      companies.push({
        company: { cnpj, razaoSocial: c.razaoSocial, situacao: c.situacao, uf: c.uf, municipio: c.municipio },
        relation: rel.relation,
        meta: rel.meta,
      });
    }
    return { person, companies };
  }
}
