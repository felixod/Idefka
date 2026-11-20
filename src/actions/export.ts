import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getState, toast } from '../store';
import { computeGeometry } from '../model/geometry';
import { diagramOrder, nodeOf } from '../model/query';
import { abcCsv } from '../model/abc';
import { orgCsv, orgDocsMd, orgOf } from '../model/org';
import { SHEET_H, SHEET_W } from '../model/sheet';
import { SheetContent } from '../components/sheet/Sheet';
import { exportFile, printHtml } from '../platform';

function diagramSvg(diagramId: string, scale = 1): string {
  const { model, showFrame } = getState();
  const diagram = model.diagrams[diagramId];
  const geom = computeGeometry(model, diagram);
  const body = renderToStaticMarkup(createElement(SheetContent, { model, diagram, geom, showFrame }));
  const size = `width="${SHEET_W * scale}" height="${SHEET_H * scale}" viewBox="0 0 ${SHEET_W} ${SHEET_H}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${size}>${body}</svg>`;
}

function fileBaseName(diagramId?: string) {
  const { model } = getState();
  const name = (model.meta.name || 'Модель').replace(/[\\/:*?"<>|]+/g, ' ').trim();
  return diagramId ? `${name} — ${nodeOf(model, diagramId)}` : name;
}

async function attempt(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    toast(`Не получилось: ${(error as Error).message}`);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('не удалось отрисовать диаграмму'));
    image.src = url;
  });
}

async function svgToPng(svg: string, scale: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = SHEET_W * scale;
    canvas.height = SHEET_H * scale;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('не удалось создать PNG');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const exportSvg = () =>
  attempt(async () => {
    const id = getState().diagramId;
    const saved = await exportFile(fileBaseName(id), diagramSvg(id), 'svg', 'Изображение SVG', 'image/svg+xml');
    if (saved) toast('Экспортировано в SVG');
  });

export const exportPng = (scale = 2) =>
  attempt(async () => {
    const id = getState().diagramId;
    const png = await svgToPng(diagramSvg(id, scale), scale);
    const saved = await exportFile(fileBaseName(id), png, 'png', 'Изображение PNG', 'image/png');
    if (saved) toast('Экспортировано в PNG');
  });

export const exportAbcCsv = () =>
  attempt(async () => {
    const saved = await exportFile(`${fileBaseName()} — ABC`, abcCsv(getState().model), 'csv', 'Таблица CSV (Excel)', 'text/csv');
    if (saved) toast('Отчёт ABC сохранён');
  });

export const exportOrgCsv = () =>
  attempt(async () => {
    const org = orgOf(getState().model);
    if (!org) throw new Error('в модели нет раздела org (оргструктура)');
    const saved = await exportFile(`${fileBaseName()} — Смета ФОТ`, orgCsv(org, getState().model), 'csv', 'Таблица CSV (Excel)', 'text/csv');
    if (saved) toast('Смета ФОТ сохранена');
  });

export const exportOrgDocs = () =>
  attempt(async () => {
    const org = orgOf(getState().model);
    if (!org) throw new Error('в модели нет раздела org (оргструктура)');
    const saved = await exportFile(`${fileBaseName()} — Положения и ДИ`, orgDocsMd(org, getState().model), 'md', 'Markdown-документ', 'text/markdown');
    if (saved) toast('Положения и должностные инструкции сохранены');
  });

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

const PRINT_STYLE = [
  '@page{size:A4 landscape;margin:0}',
  'html,body{margin:0;padding:0}',
  '.page{width:297mm;height:210mm;display:flex;align-items:center;justify-content:center;page-break-after:always;overflow:hidden}',
  '.page:last-child{page-break-after:auto}',
  '.page svg{width:287mm;height:200mm}',
].join('');

export function printModel(onlyCurrent = false) {
  const { model, diagramId } = getState();
  const ids = onlyCurrent ? [diagramId] : diagramOrder(model).filter((id) => model.diagrams[id].boxes.length);
  const pages = ids.map((id) => `<div class="page">${diagramSvg(id)}</div>`).join('');
  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(fileBaseName())}</title><style>${PRINT_STYLE}</style></head><body>${pages}</body></html>`);
}
