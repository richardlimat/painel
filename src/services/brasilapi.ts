import type {
  CompanyLookupResult,
  CompanyStatus,
  PartnerInfo,
  PersonLookupResult,
  RelationType,
} from '../types/graph';
import { onlyDigits } from '../lib/format';
import { CompanyNotFoundError, DataProvider, ReverseLookupUnsupportedError } from './provider';

interface BrasilApiQsa {
  nome_socio: string;
  cnpj_cpf_do_socio: string;
  qualificacao_socio: string;
  data_entrada_sociedade?: string;
  identificador_de_socio?: number; // 1 = PJ, 2 = PF
  percentual_capital_social?: number;
}

interface BrasilApiCnpj {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  cnae_fiscal?: number;
  cnae_fiscal_descricao?: string;
  cnaes_secundarios?: { codigo: number; descricao: string }[];
  natureza_juridica?: string;
  capital_social?: number;
  data_inicio_atividade?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  ddd_telefone_1?: string;
  email?: string | null;
  identificador_matriz_filial?: number; // 1 = matriz, 2 = filial
  qsa?: BrasilApiQsa[];
}

function mapStatus(s?: string): CompanyStatus {
  const v = (s ?? '').toUpperCase();
  if (v.includes('ATIVA')) return 'ATIVA';
  if (v.includes('BAIXADA')) return 'BAIXADA';
  if (v.includes('SUSPENSA')) return 'SUSPENSA';
  if (v.includes('INAPTA')) return 'INAPTA';
  if (v.includes('NULA')) return 'NULA';
  return 'DESCONHECIDA';
}

function mapRelation(qualificacao: string): RelationType {
  const q = qualificacao.toUpperCase();
  if (q.includes('ADMINISTRADOR')) return 'ADMINISTRADOR';
  if (q.includes('REPRESENTANTE')) return 'REPRESENTANTE_LEGAL';
  if (q.includes('PRESIDENTE') || q.includes('DIRETOR')) return 'ADMINISTRADOR';
  return 'SOCIO';
}

/**
 * Provedor baseado na BrasilAPI (dados abertos da Receita Federal).
 * Suporta consulta de CNPJ + QSA; não suporta busca reversa por CPF.
 */
export class BrasilApiProvider implements DataProvider {
  readonly name = 'BrasilAPI';

  async getCompany(cnpj: string): Promise<CompanyLookupResult> {
    const digits = onlyDigits(cnpj);
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
    if (res.status === 404) throw new CompanyNotFoundError(cnpj);
    if (!res.ok) throw new Error(`Falha na consulta BrasilAPI (HTTP ${res.status})`);
    const data = (await res.json()) as BrasilApiCnpj;

    const partners: PartnerInfo[] = (data.qsa ?? []).map((q) => {
      const relation = mapRelation(q.qualificacao_socio ?? '');
      const meta = {
        percentual: q.percentual_capital_social || undefined,
        dataEntrada: q.data_entrada_sociedade,
        situacao: 'ATIVO',
        origem: 'BrasilAPI / Receita Federal',
        funcao: q.qualificacao_socio,
      };
      if (q.identificador_de_socio === 1) {
        return { company: { cnpj: onlyDigits(q.cnpj_cpf_do_socio), razaoSocial: q.nome_socio }, relation: 'PARTICIPACAO' as RelationType, meta };
      }
      return {
        person: {
          cpf: q.cnpj_cpf_do_socio || q.nome_socio,
          nome: q.nome_socio,
          administrador: relation === 'ADMINISTRADOR',
        },
        relation,
        meta,
      };
    });

    return {
      company: {
        cnpj: digits,
        razaoSocial: data.razao_social,
        nomeFantasia: data.nome_fantasia || undefined,
        situacao: mapStatus(data.descricao_situacao_cadastral),
        cnaePrincipal: data.cnae_fiscal
          ? { codigo: String(data.cnae_fiscal), descricao: data.cnae_fiscal_descricao ?? '' }
          : undefined,
        cnaesSecundarios: (data.cnaes_secundarios ?? [])
          .filter((c) => c.codigo)
          .map((c) => ({ codigo: String(c.codigo), descricao: c.descricao })),
        naturezaJuridica: data.natureza_juridica,
        capitalSocial: data.capital_social,
        dataAbertura: data.data_inicio_atividade,
        endereco: [data.logradouro, data.numero, data.bairro].filter(Boolean).join(', '),
        municipio: data.municipio,
        uf: data.uf,
        telefone: data.ddd_telefone_1,
        email: data.email || undefined,
        matriz: data.identificador_matriz_filial !== 2,
      },
      partners,
    };
  }

  async getPersonCompanies(): Promise<PersonLookupResult> {
    throw new ReverseLookupUnsupportedError(this.name);
  }
}
