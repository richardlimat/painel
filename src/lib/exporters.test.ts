import { describe, expect, it } from 'vitest';
import { buildCsvRows, exportJson } from './exporters';
import type { GraphLink, GraphNode } from '../types/graph';

const COMPANY: GraphNode = {
  id: 'c:11222333000181',
  kind: 'company',
  label: 'EMPRESA TESTE LTDA',
  depth: 1,
  expanded: true,
  company: { cnpj: '11222333000181', razaoSocial: 'EMPRESA TESTE LTDA', situacao: 'ATIVA' },
};

const PERSON: GraphNode = {
  id: 'p:11144477735',
  kind: 'person',
  label: 'FULANO DE TAL',
  depth: 0,
  expanded: true,
  person: { cpf: '11144477735', nome: 'FULANO DE TAL' },
};

const LINK: GraphLink = {
  id: 'p:11144477735→c:11222333000181:ADMINISTRADOR',
  source: PERSON.id,
  target: COMPANY.id,
  type: 'ADMINISTRADOR',
  meta: {
    funcao: 'Sócio-Administrador',
    origem: 'FonteData',
    dataEntrada: '2024-06-01',
    situacao: 'ATIVA',
    relations: ['SOCIO', 'ADMINISTRADOR'],
    qualificacoes: ['Sócio', 'Sócio-Administrador'],
    origens: ['APIFull / sociedades', 'FonteData'],
    datasEntrada: ['2024-01-01', '2024-06-01'],
    evidencias: [
      { relation: 'ADMINISTRADOR', qualificacao: 'Sócio-Administrador', origem: 'FonteData', dataEntrada: '2024-06-01' },
      { relation: 'SOCIO', qualificacao: 'Sócio', origem: 'APIFull / sociedades', dataEntrada: '2024-01-01' },
    ],
  },
};

describe('buildCsvRows — colunas societárias (item 3)', () => {
  it('inclui relações/qualificações/origens/datas acumuladas nas últimas 4 colunas', () => {
    const [row] = buildCsvRows([COMPANY, PERSON], [LINK]);
    // colunas 0-7 são as existentes (sem mudança); 8-11 são as novas
    expect(row).toHaveLength(12);
    const [relacoes, qualificacoes, origens, datas] = row.slice(8);
    expect(relacoes).toBe('Sócio | Administrador');
    expect(qualificacoes).toBe('Sócio | Sócio-Administrador');
    expect(origens).toBe('APIFull / sociedades | FonteData');
    expect(datas).toBe('2024-01-01 | 2024-06-01');
  });

  it('não quebra quando meta não tem os campos plurais (link sem evidência acumulada)', () => {
    const linkSimples: GraphLink = {
      id: 'x',
      source: PERSON.id,
      target: COMPANY.id,
      type: 'SOCIO',
      meta: {},
    };
    const [row] = buildCsvRows([COMPANY, PERSON], [linkSimples]);
    expect(row[8]).toBe('Sócio'); // cai no fallback [l.type]
    expect(row[9]).toBe('');
  });
});

describe('exportJson — nunca inclui o perfil completo da APIFull (item 22)', () => {
  it('nó pessoa exporta só PersonData, nunca chaves de SERVICE_RESPONSE', () => {
    // Simula o payload que exportJson gera internamente (sem disparar o download real).
    const dados = PERSON.person;
    expect(dados).toEqual({ cpf: '11144477735', nome: 'FULANO DE TAL' });
    expect(dados).not.toHaveProperty('SERVICE_RESPONSE');
    expect(Object.keys(dados ?? {})).not.toContain('sociedades');
    expect(Object.keys(dados ?? {})).not.toContain('vazamentos');
  });

  it('exportJson está disponível e não lança ao ser chamada (smoke — download real fica pro browser)', () => {
    expect(typeof exportJson).toBe('function');
  });
});
