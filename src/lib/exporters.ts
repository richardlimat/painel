import { toPng, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { GraphLink, GraphNode } from '../types/graph';
import { RELATION_LABELS } from './colors';

function download(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  download(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const EXPORT_OPTS = { pixelRatio: 3, cacheBust: true };

export async function exportPng(el: HTMLElement) {
  const dataUrl = await toPng(el, EXPORT_OPTS);
  download(dataUrl, 'grafo-societario.png');
}

export async function exportSvg(el: HTMLElement) {
  const dataUrl = await toSvg(el, { cacheBust: true });
  download(dataUrl, 'grafo-societario.svg');
}

/** Gera um PDF preservando exatamente o layout atual do grafo (via captura raster) */
export async function exportPdf(el: HTMLElement) {
  const dataUrl = await toPng(el, EXPORT_OPTS);
  const { width, height } = el.getBoundingClientRect();
  const landscape = width >= height;
  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'px', format: [width, height] });
  pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
  pdf.save('grafo-societario.pdf');
}

const nid = (v: string | GraphNode) => (typeof v === 'string' ? v : v.id);

export function exportJson(nodes: GraphNode[], links: GraphLink[]) {
  const payload = {
    geradoEm: new Date().toISOString(),
    nos: nodes.map((n) => ({
      id: n.id,
      tipo: n.kind === 'company' ? 'empresa' : 'pessoa',
      rotulo: n.label,
      camada: n.depth,
      dados: n.kind === 'company' ? n.company : n.person,
    })),
    conexoes: links.map((l) => {
      // percentual de participação não deve ser divulgado
      const { percentual: _omitido, ...metadados } = l.meta;
      return {
        origem: nid(l.source),
        destino: nid(l.target),
        tipo: RELATION_LABELS[l.type],
        metadados,
      };
    }),
  };
  downloadBlob(JSON.stringify(payload, null, 2), 'application/json', 'grafo-societario.json');
}

const CSV_HEADER = [
  'origem',
  'origem_tipo',
  'destino',
  'destino_tipo',
  'relacao',
  'data_entrada',
  'situacao',
  'origem_informacao',
  // Colunas societárias: todas as relações/qualificações/origens/datas acumuladas
  // (ver RelationshipMeta.evidencias) — não só a "principal". Nunca inclui o
  // perfil completo da APIFull, só metadados de relação já presentes no grafo.
  'relacoes',
  'qualificacoes',
  'origens_informacao',
  'datas_entrada',
];

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Monta as linhas do CSV (puro, sem download) — testável sem DOM. */
export function buildCsvRows(nodes: GraphNode[], links: GraphLink[]): string[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return links.map((l) => {
    const s = byId.get(nid(l.source));
    const t = byId.get(nid(l.target));
    return [
      s?.label ?? nid(l.source),
      s?.kind === 'company' ? 'empresa' : 'pessoa',
      t?.label ?? nid(l.target),
      t?.kind === 'company' ? 'empresa' : 'pessoa',
      RELATION_LABELS[l.type],
      l.meta.dataEntrada ?? '',
      l.meta.situacao ?? '',
      l.meta.origem ?? '',
      (l.meta.relations ?? [l.type]).map((r) => RELATION_LABELS[r]).join(' | '),
      (l.meta.qualificacoes ?? []).join(' | '),
      (l.meta.origens ?? []).join(' | '),
      (l.meta.datasEntrada ?? []).join(' | '),
    ];
  });
}

export function exportCsv(nodes: GraphNode[], links: GraphLink[]) {
  const rows = buildCsvRows(nodes, links).map((row) => row.map(csvEscape).join(';'));
  downloadBlob(['﻿' + CSV_HEADER.join(';'), ...rows].join('\n'), 'text/csv;charset=utf-8', 'conexoes-societarias.csv');
}
