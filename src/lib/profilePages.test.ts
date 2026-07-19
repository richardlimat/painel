import { describe, expect, it } from 'vitest';
import {
  PROFILE_PAGE_ORDER,
  SAUDE_E_OUTROS,
  groupServiceResponseIntoPages,
} from './profilePages';

function pageEntries(groups: ReturnType<typeof groupServiceResponseIntoPages>, name: string): string[] {
  return groups.find((g) => g.name === name)!.entries.map(([k]) => k);
}

describe('groupServiceResponseIntoPages', () => {
  it('sempre devolve as 8 páginas na ordem pedida pelo produto', () => {
    const groups = groupServiceResponseIntoPages({});
    expect(groups.map((g) => g.name)).toEqual(PROFILE_PAGE_ORDER);
    expect(PROFILE_PAGE_ORDER).toHaveLength(8);
    expect(PROFILE_PAGE_ORDER[0]).toBe('Cadastral & Civil');
    expect(PROFILE_PAGE_ORDER[PROFILE_PAGE_ORDER.length - 1]).toBe(SAUDE_E_OUTROS);
  });

  it('classifica cada chave conhecida na página temática correspondente', () => {
    const groups = groupServiceResponseIntoPages({
      cadastral: {},
      documentos: {},
      parentes: [],
      telefones: [],
      enderecos: [],
      contasBancarias: [],
      scoreCredito: {},
      sociedades: [],
      cargoPublico: {},
      credenciaisVazadas: [],
      viagens: [],
      veiculos: [],
      imoveis: [],
    });

    expect(pageEntries(groups, 'Cadastral & Civil')).toEqual(
      expect.arrayContaining(['cadastral', 'documentos', 'parentes']),
    );
    expect(pageEntries(groups, 'Contatos & Endereços')).toEqual(
      expect.arrayContaining(['telefones', 'enderecos']),
    );
    expect(pageEntries(groups, 'Financeiro & Consumo')).toEqual(
      expect.arrayContaining(['contasBancarias', 'scoreCredito']),
    );
    expect(pageEntries(groups, 'Carreira & Negócios')).toEqual(
      expect.arrayContaining(['sociedades', 'cargoPublico']),
    );
    expect(pageEntries(groups, 'Cyber Sec & Vazamentos')).toEqual(
      expect.arrayContaining(['credenciaisVazadas']),
    );
    expect(pageEntries(groups, 'Presença & Viagens')).toEqual(expect.arrayContaining(['viagens']));
    expect(pageEntries(groups, 'Bens & Patrimônio')).toEqual(
      expect.arrayContaining(['veiculos', 'imoveis']),
    );
  });

  it('vazamento vence "documento" — credenciaisVazadas nunca cai em Cadastral & Civil', () => {
    const groups = groupServiceResponseIntoPages({ credenciaisVazadas: [] });
    expect(pageEntries(groups, 'Cyber Sec & Vazamentos')).toContain('credenciaisVazadas');
    expect(pageEntries(groups, 'Cadastral & Civil')).not.toContain('credenciaisVazadas');
  });

  it('chave desconhecida/nova cai em "Saúde & Outros" — nenhuma é descartada', () => {
    const groups = groupServiceResponseIntoPages({ saude: {}, campoNovoDesconhecido: 1 });
    expect(pageEntries(groups, SAUDE_E_OUTROS)).toEqual(
      expect.arrayContaining(['saude', 'campoNovoDesconhecido']),
    );
  });
});
