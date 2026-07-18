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

export function mapStatus(s?: string): CompanyStatus {
  const v = (s ?? '').toUpperCase();
  if (v.includes('ATIVA')) return 'ATIVA';
  if (v.includes('BAIXADA')) return 'BAIXADA';
  if (v.includes('SUSPENSA')) return 'SUSPENSA';
  if (v.includes('INAPTA')) return 'INAPTA';
  if (v.includes('NULA')) return 'NULA';
  return 'DESCONHECIDA';
}

export function mapRelation(cargo: string): RelationType {
  const c = cargo.toUpperCase();
  if (c.includes('ADMINISTRADOR')) return 'ADMINISTRADOR';
  if (c.includes('REPRESENTANTE')) return 'REPRESENTANTE_LEGAL';
  if (c.includes('PRESIDENTE') || c.includes('DIRETOR')) return 'ADMINISTRADOR';
  return 'SOCIO';
}

/** Converte "DD/MM/YYYY HH:mm:ss" (formato FonteData/APIFull) para ISO "YYYY-MM-DD" */
export function parseBrDate(v?: string): string | undefined {
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
export async function extractErrorDetail(res: Response): Promise<string | undefined> {
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

/** Mensagem amigável por status HTTP (sempre com o detalhe real do corpo anexado, quando houver) */
function messageForStatus(status: number, detail: string | undefined): string {
  const suffix = detail ? ` Detalhe: ${detail}` : '';
  switch (status) {
    case 400:
      return `CNPJ ou parâmetro inválido.${suffix}`;
    case 401:
    case 403:
      return `Chave de API da FonteData ausente ou inválida (configuração do servidor).${suffix}`;
    case 402:
      return `Saldo insuficiente na conta FonteData.${suffix}`;
    case 429:
      return `Limite de requisições da FonteData excedido. Tente novamente em instantes.${suffix}`;
    default:
      if (status >= 500 && status <= 503) return `FonteData indisponível no momento.${suffix}`;
      return `Falha na consulta FonteData (HTTP ${status})${suffix}`;
  }
}

/**
 * Provedor baseado na FonteData (https://fontedata.com), API comercial de
 * dados cadastrais de pessoas jurídicas. Suporta consulta de CNPJ + QSA;
 * não suporta busca reversa por CPF.
 */
export class FonteDataProvider implements DataProvider {
  readonly name = 'FonteData';
  /** Cache por CNPJ normalizado: evita cobrar duas vezes o mesmo documento
   * mesmo quando ele é descoberto por dois caminhos diferentes do grafo
   * quase ao mesmo tempo. Sobrevive a reset/recolher do grafo (dura a
   * instância do provider, criada uma única vez em graphStore). */
  private companyCache = new Map<string, Promise<CompanyLookupResult>>();

  async getCompany(cnpj: string): Promise<CompanyLookupResult> {
    const digits = onlyDigits(cnpj);
    if (!/^\d{14}$/.test(digits)) {
      throw new Error('CNPJ inválido: informe exatamente 14 dígitos.');
    }
    const cacheKey = `cadastro-pj-plus:${digits}`;
    const cached = this.companyCache.get(cacheKey);
    if (cached) return cached;

    const promise = this.fetchCompany(digits).catch((err) => {
      this.companyCache.delete(cacheKey); // erro não fica em cache — permite nova tentativa
      throw err;
    });
    this.companyCache.set(cacheKey, promise);
    return promise;
  }

  private async fetchCompany(digits: string): Promise<CompanyLookupResult> {
    // Chamada same-origin: o proxy em api/cadastro-pj-plus.ts repassa para a
    // FonteData no servidor, evitando CORS e mantendo a chave fora do bundle.
    const res = await fetch(`/api/cadastro-pj-plus?CNPJ=${digits}`);
    if (res.status === 404) throw new CompanyNotFoundError(digits);
    if (!res.ok) {
      const detail = await extractErrorDetail(res);
      throw new Error(messageForStatus(res.status, detail));
    }
    let data: FonteDataCadastroPjPlus;
    try {
      data = (await res.json()) as FonteDataCadastroPjPlus;
    } catch {
      throw new Error('Resposta inesperada da consulta FonteData (endpoint /api/cadastro-pj-plus indisponível).');
    }
    if (!data.cnpj) throw new CompanyNotFoundError(digits);

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
