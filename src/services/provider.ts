import type { CompanyLookupResult, PersonLookupResult } from '../types/graph';

/**
 * Interface de provedor de dados societários.
 *
 * O sistema é agnóstico à origem dos dados: qualquer fonte (BrasilAPI,
 * CNPJá, BigDataCorp, base interna, etc.) pode ser plugada implementando
 * esta interface.
 */
export interface DataProvider {
  readonly name: string;
  /** Consulta dados cadastrais + QSA de um CNPJ */
  getCompany(cnpj: string): Promise<CompanyLookupResult>;
  /**
   * Consulta as empresas em que uma pessoa participa (busca reversa por CPF).
   * Provedores públicos gratuitos não suportam — devem lançar
   * ReverseLookupUnsupportedError.
   */
  getPersonCompanies(personId: string, personName: string): Promise<PersonLookupResult>;
}

export class ReverseLookupUnsupportedError extends Error {
  constructor() {
    super('Esta busca não está disponível para o tipo de documento informado.');
    this.name = 'ReverseLookupUnsupportedError';
  }
}

export class CompanyNotFoundError extends Error {
  constructor(cnpj: string) {
    super(`CNPJ ${cnpj} não encontrado.`);
    this.name = 'CompanyNotFoundError';
  }
}
