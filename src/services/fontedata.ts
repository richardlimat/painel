import type {
  CompanyLookupResult,
  CompanyStatus,
  PartnerInfo,
  PersonLookupResult,
  RelationType,
} from '../types/graph';
import { onlyDigits } from '../lib/format';
import { CompanyNotFoundError, DataProvider, ReverseLookupUnsupportedError } from './provider';

interface FonteDataEmail {
  enderecoEmail: string;
}

interface FonteDataTelefone {
  whatsApp?: boolean;
  operadora?: string;
  tipoTelefone?: string;
  telefoneComDDD: string;
  telemarketingBloqueado?: boolean;
}

interface FonteDataEndereco {
  uf?: string;
  cep?: string;
  bairro?: string;
  cidade?: string;
  numero?: string;
  logradouro?: string;
  complemento?: string | null;
}

interface FonteDataSocio {
  nome: string;
  cargo?: string;
  documento?: string;
  dataEntrada?: string;
  percentualParticipacao?: number | null;
}

interface FonteDataCnaeSecundario {
  cnaeCodigoSecundario: number;
  cnaeDescricaoSecundario: string;
}

interface FonteDataCadastroPjPlus {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  situacaoCadastral?: string;
  cnaeCodigo?: number;
  cnaeDescricao?: string;
  cnaEsSecundarios?: FonteDataCnaeSecundario[];
  naturezaJuridicaDescricao?: string;
  dataFundacao?: string;
  enderecos?: FonteDataEndereco[];
  telefones?: FonteDataTelefone[];
  emails?: FonteDataEmail[];
  matriz?: boolean;
  socios?: FonteDataSocio[];
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

function mapRelation(cargo: string): RelationType {
  const c = cargo.toUpperCase();
  if (c.includes('ADMINISTRADOR')) return 'ADMINISTRADOR';
  if (c.includes('REPRESENTANTE')) return 'REPRESENTANTE_LEGAL';
  if (c.includes('PRESIDENTE') || c.includes('DIRETOR')) return 'ADMINISTRADOR';
  return 'SOCIO';
}

/** Converte "DD/MM/YYYY HH:mm:ss" (formato FonteData) para ISO "YYYY-MM-DD" */
function parseBrDate(v?: string): string | undefined {
  if (!v) return undefined;
  const [datePart] = v.split(' ');
  const [day, month, year] = (datePart ?? '').split('/');
  if (!day || !month || !year) return undefined;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function formatEndereco(e?: FonteDataEndereco): string | undefined {
  if (!e) return undefined;
  return [e.logradouro, e.numero, e.bairro].filter(Boolean).join(', ') || undefined;
}

/** Extrai a mensagem de erro do corpo da resposta (JSON ou texto), quando houver */
async function extractErrorDetail(res: Response): Promise<string | undefined> {
  try {
    const body = await res.clone().json();
    const msg = body?.message ?? body?.mensagem ?? body?.erro ?? body?.error ?? body;
    if (msg == null) return undefined;
    return typeof msg === 'string' ? msg : JSON.stringify(msg);
  } catch {
    try {
      const text = await res.clone().text();
      return text || undefined;
    } catch {
      return undefined;
    }
  }
}

/**
 * Provedor baseado na FonteData (https://fontedata.com), API comercial de
 * dados cadastrais de pessoas jurídicas. Suporta consulta de CNPJ + QSA;
 * não suporta busca reversa por CPF.
 */
export class FonteDataProvider implements DataProvider {
  readonly name = 'FonteData';

  async getCompany(cnpj: string): Promise<CompanyLookupResult> {
    const digits = onlyDigits(cnpj);
    // Chamada same-origin: o proxy em api/cadastro-pj-plus.ts repassa para a
    // FonteData no servidor, evitando CORS e mantendo a chave fora do bundle.
    const res = await fetch(`/api/cadastro-pj-plus?CNPJ=${digits}`);
    if (res.status === 404) throw new CompanyNotFoundError(cnpj);
    if (!res.ok) {
      const detail = await extractErrorDetail(res);
      if (res.status === 401 || res.status === 403 || res.status === 500) {
        throw new Error(
          `Chave de API da FonteData ausente ou inválida (configuração do servidor).${detail ? ` Detalhe: ${detail}` : ''}`,
        );
      }
      throw new Error(`Falha na consulta FonteData (HTTP ${res.status})${detail ? `: ${detail}` : ''}`);
    }
    let data: FonteDataCadastroPjPlus;
    try {
      data = (await res.json()) as FonteDataCadastroPjPlus;
    } catch {
      throw new Error('Resposta inesperada da consulta FonteData (endpoint /api/cadastro-pj-plus indisponível).');
    }
    if (!data.cnpj) throw new CompanyNotFoundError(cnpj);

    const enderecoPrincipal = data.enderecos?.[0];

    const partners: PartnerInfo[] = (data.socios ?? []).map((s) => {
      const docDigits = onlyDigits(s.documento ?? '');
      const relation = mapRelation(s.cargo ?? '');
      const meta = {
        percentual: s.percentualParticipacao ?? undefined,
        dataEntrada: parseBrDate(s.dataEntrada),
        situacao: 'ATIVO',
        origem: 'FonteData',
        funcao: s.cargo,
      };
      if (docDigits.length === 14) {
        return { company: { cnpj: docDigits, razaoSocial: s.nome }, relation: 'PARTICIPACAO' as RelationType, meta };
      }
      return {
        person: {
          cpf: docDigits || s.nome,
          nome: s.nome,
          administrador: relation === 'ADMINISTRADOR',
        },
        relation,
        meta,
      };
    });

    return {
      company: {
        cnpj: digits,
        razaoSocial: data.razaoSocial,
        nomeFantasia: data.nomeFantasia || undefined,
        situacao: mapStatus(data.situacaoCadastral),
        cnaePrincipal: data.cnaeCodigo
          ? { codigo: String(data.cnaeCodigo), descricao: data.cnaeDescricao ?? '' }
          : undefined,
        cnaesSecundarios: (data.cnaEsSecundarios ?? []).map((c) => ({
          codigo: String(c.cnaeCodigoSecundario),
          descricao: c.cnaeDescricaoSecundario,
        })),
        naturezaJuridica: data.naturezaJuridicaDescricao,
        dataAbertura: parseBrDate(data.dataFundacao),
        endereco: formatEndereco(enderecoPrincipal),
        municipio: enderecoPrincipal?.cidade,
        uf: enderecoPrincipal?.uf,
        telefone: data.telefones?.[0]?.telefoneComDDD,
        email: data.emails?.[0]?.enderecoEmail,
        matriz: data.matriz,
      },
      partners,
    };
  }

  async getPersonCompanies(): Promise<PersonLookupResult> {
    throw new ReverseLookupUnsupportedError(this.name);
  }
}
