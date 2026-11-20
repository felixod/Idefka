import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getState, toast } from '../store';
import { computeGeometry } from '../model/geometry';
import { diagramOrder, nodeOf } from '../model/query';
import { abcCsv } from '../model/abc';
import { buildDocxBlob, type DocTable } from '../model/orgdocx';
import { kpiOf, orgOf, roleFots, workIndex } from '../model/org';
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


const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function orgDocContext(org: NonNullable<ReturnType<typeof orgOf>>, model: ReturnType<typeof getState>['model']) {
  return {
    works: workIndex(model),
    date: new Date().toLocaleDateString('ru-RU'),
    company: model.meta.author || 'ИТ-компания',
  };
}

export const exportOrgDocDocx = (kind: 'polozhenie' | 'di', scopeId: string) =>
  attempt(async () => {
    const state = getState();
    const org = orgOf(state.model);
    if (!org) throw new Error('в модели нет раздела org (оргструктура)');
    if (!org.templates) throw new Error('шаблоны не созданы — откройте вкладку «Документы»');
    const tpl = kind === 'polozhenie' ? org.templates.polozhenie : org.templates.di;
    const { works, date, company } = orgDocContext(org, state.model);
    const roles = roleFots(org);

    let name: string;
    let tags: Record<string, string>;
    let tables: Record<string, DocTable>;

    if (kind === 'polozhenie') {
      const dep = org.departments.find((d) => d.id === scopeId);
      if (!dep) throw new Error('подразделение не найдено');
      const depRoles = roles.filter((r) => r.dep.id === scopeId);
      const worksSet = [...new Set(depRoles.flatMap((r) => r.role.works ?? []))]
        .filter((w) => works.has(w))
        .sort((a, b) => (works.get(a)?.num ?? '').localeCompare(works.get(b)?.num ?? ''));
      name = `Положение — ${dep.name}.docx`;
      tags = {
        КОМПАНИЯ: company,
        ОТДЕЛ: dep.name,
        ВЕРСИЯ: '0.1 (из модели)',
        ДАТА: date,
        ОБЩИЕ: `Отдел — структурное подразделение компании. Подчинение: ${dep.parentId ? org.departments.find((d) => d.id === dep.parentId)?.name ?? '—' : 'директору ИТ-компании'}. Тип: ${dep.kind}.`,
        ЦЕЛИ: dep.goals?.map((g, i) => `${i + 1}. ${g}`).join('; ') || '(заполнить)',
        ШТАТ_ИТОГО: `Итого штатных единиц: ${depRoles.reduce((s, r) => s + r.role.fte, 0)}.`,
        ЭКОНОМИКА: `ФОТ отдела: ${Math.round(depRoles.reduce((s, r) => s + r.fotYear, 0)).toLocaleString('ru-RU')} ₽/год (с взносами).`,
        ПРАВА: 'Запрашивать информацию у смежных отделов и предприятий; приостанавливать изменения вне CAB; эскалировать владельцу процесса.',
      };
      tables = {
        ШТАТ: { headers: ['Роль', 'Грейд', 'FTE', 'Оклад, ₽/мес'],
          rows: depRoles.map((r) => [r.role.name, r.role.grade, String(r.role.fte),
            `${r.role.salaryMin.toLocaleString('ru-RU')}–${r.role.salaryMax.toLocaleString('ru-RU')}`]) },
        ФУНКЦИИ: { headers: ['Узел', 'Работа (IDEF0)', 'Исполнители'],
          rows: worksSet.map((w) => {
            const info = works.get(w)!;
            const who = [...new Set(depRoles.filter((r) => r.role.works?.includes(w)).map((r) => r.role.name))];
            return [info.num, info.name, who.join(', ')];
          }) },
        KPI: { headers: ['Узел', 'Показатель'],
          rows: worksSet.flatMap((w) => (works.get(w)?.note ? kpiOf(works.get(w)!.note).map((k) => [works.get(w)!.num, k]) : [])) },
      };
    } else {
      const found = roles.find((r) => r.role.id === scopeId);
      if (!found) throw new Error('роль не найдена');
      const rw = (found.role.works ?? []).filter((w) => works.has(w));
      const boss = found.role.reportsTo ? roles.find((x) => x.role.id === found.role.reportsTo)?.role.name ?? found.role.reportsTo : 'директор ИТ-компании';
      name = `ДИ — ${found.role.name}.docx`;
      tags = {
        КОМПАНИЯ: company,
        ДОЛЖНОСТЬ: found.role.name,
        ОТДЕЛ: found.dep.name,
        ГРЕЙД: found.role.grade,
        РУКОВОДИТЕЛЬ: boss,
        ОКЛАД: `${found.role.salaryMin.toLocaleString('ru-RU')}–${found.role.salaryMax.toLocaleString('ru-RU')}`,
        ДАТА: date,
        ОБЩИЕ: `Специалист отдела «${found.dep.name}», грейд ${found.role.grade}. Непосредственный руководитель: ${boss}.`,
        ЗНАНИЯ: 'Профстандарт «Специалист по технической поддержке ИКС» (приказ Минтруда № 675н) — уровень грейда; ГОСТ Р ИСО/МЭК 14764; регламенты процессов модели и БЗ своего домена.',
        ЭКОНОМИКА: `ФОТ роли: ${Math.round(found.fotYear).toLocaleString('ru-RU')} ₽/год. Вклад в работы (Ф4): ${rw.map((w) => `${works.get(w)?.num} — ${Math.round(found.fotYear / rw.length).toLocaleString('ru-RU')} ₽/год`).join('; ')}`,
        ПРАВА: 'Запрашивать данные и доступы; эскалировать блокеры; требовать актуальности CMDB/БЗ в своей зоне. Ответственность: за нарушение регламентов и SLA, за действия вне выданных доступов.',
      };
      tables = {
        ПРОЦЕССЫ: { headers: ['Узел', 'Работа', 'Вклад, ₽/год'],
          rows: rw.map((w) => { const info = works.get(w)!;
            return [info.num, info.name, Math.round(found.fotYear / rw.length).toLocaleString('ru-RU')]; }) },
        KPI: { headers: ['Узел', 'Показатель'],
          rows: rw.flatMap((w) => (works.get(w)?.note ? kpiOf(works.get(w)!.note).map((k) => [works.get(w)!.num, k]) : [])) },
      };
    }

    const blob = await buildDocxBlob(tpl, { tags, tables });
    const saved = await exportFile(name, blob, 'docx', 'Документ Word', DOCX_MIME);
    if (saved) toast('DOCX сохранён');
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
