import type { Model, OrgData, OrgDepartment, OrgRole } from './types';
import { boxNumber, diagramOrder } from './query';

export const DEFAULT_ORG_PARAMS = {
  months: 12,
  socialRate: 0.302,
  ticketsPerMonth: 1500,
  usersPerSite: 350,
  ticketsPerUserPerMonth: 0.8,
  sites: 8,
};

export function orgOf(model: Model): OrgData | null {
  const org = model.org;
  if (!org || !Array.isArray(org.departments) || !org.departments.length) return null;
  org.params = { ...DEFAULT_ORG_PARAMS, ...org.params };
  return org;
}

export interface RoleFot {
  role: OrgRole;
  dep: OrgDepartment;
  avg: number;
  fotMonth: number;
  fotYear: number;
}

export interface DepFot {
  dep: OrgDepartment;
  fte: number;
  fotMonth: number;
  fotYear: number;
  share: number;
}

export function roleFots(org: OrgData): RoleFot[] {
  const out: RoleFot[] = [];
  for (const dep of org.departments) {
    for (const role of dep.roles ?? []) {
      const avg = ((role.salaryMin || 0) + (role.salaryMax || 0)) / 2;
      const fotMonth = avg * (role.fte || 0);
      out.push({
        role,
        dep,
        avg,
        fotMonth,
        fotYear: fotMonth * org.params.months * (1 + org.params.socialRate),
      });
    }
  }
  return out;
}

export function depFots(org: OrgData): DepFot[] {
  const totalYear = roleFots(org).reduce((sum, r) => sum + r.fotYear, 0) || 1;
  return org.departments.map((dep) => {
    const depRoles = roleFots(org).filter((r) => r.dep.id === dep.id);
    const fotYear = depRoles.reduce((sum, r) => sum + r.fotYear, 0);
    return {
      dep,
      fte: depRoles.reduce((sum, r) => sum + (r.role.fte || 0), 0),
      fotMonth: depRoles.reduce((sum, r) => sum + r.fotMonth, 0),
      fotYear,
      share: fotYear / totalYear,
    };
  });
}

export interface WorkInfo {
  num: string;
  name: string;
  note: string;
}

export function workIndex(model: Model): Map<string, WorkInfo> {
  const out = new Map<string, WorkInfo>();
  for (const diagramId of diagramOrder(model, 'idef0')) {
    for (const box of model.diagrams[diagramId].boxes) {
      if (box.kind !== 'activity' || out.has(box.id)) continue;
      out.set(box.id, {
        num: boxNumber(model, diagramId, box.id),
        name: box.name.replace(/\n/g, ' '),
        note: (box.note ?? '').trim(),
      });
    }
  }
  return out;
}

/** Годовая стоимость работы: ФОТ роли делится поровну между её работами. */
export function workFot(org: OrgData): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of roleFots(org)) {
    const works = (r.role.works ?? []).filter(Boolean);
    if (!works.length) continue;
    const share = r.fotYear / works.length;
    for (const wid of works) out.set(wid, (out.get(wid) ?? 0) + share);
  }
  return out;
}

export interface OrgSummary {
  totalFte: number;
  fotMonth: number;
  fotYear: number;
  ticketPrice: number;
  siteTicketsYear: number;
  costPerSiteYear: number;
}

export function orgSummary(org: OrgData): OrgSummary {
  const roles = roleFots(org);
  const p = org.params;
  const fotMonth = roles.reduce((sum, r) => sum + r.fotMonth, 0);
  const fotYear = roles.reduce((sum, r) => sum + r.fotYear, 0);
  // цена обращения: ФОТ отделов, у которых id начинается с 'SD', либо всех ролей без привязки к работам
  const sdRoles = roles.filter((r) => /^sd/i.test(r.dep.id));
  const sdYear = (sdRoles.length ? sdRoles : roles).reduce((sum, r) => sum + r.fotYear, 0);
  const ticketPrice = p.ticketsPerMonth > 0 ? sdYear / (p.ticketsPerMonth * p.months) : 0;
  const siteTicketsYear = p.usersPerSite * p.ticketsPerUserPerMonth * p.months;
  return {
    totalFte: roles.reduce((sum, r) => sum + (r.role.fte || 0), 0),
    fotMonth,
    fotYear,
    ticketPrice,
    siteTicketsYear,
    costPerSiteYear: ticketPrice * siteTicketsYear,
  };
}

export const formatRub = (value: number) =>
  `${Math.round(value).toLocaleString('ru-RU')} ₽`;

function kpiOf(note: string): string[] {
  if (!note) return [];
  return note
    .split(/(?<=[.;])\s+/)
    .map((part) => part.trim().replace(/[.;]$/, ''))
    .filter((part) => /\d+\s*%|>=|<=/.test(part));
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
const num = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

/** Смета ФОТ в CSV (Excel, разделитель ;). */
export function orgCsv(org: OrgData, model: Model): string {
  const works = workIndex(model);
  const rows: string[][] = [];
  rows.push(['Раздел', 'Отдел', 'Роль', 'Грейд', 'FTE', 'Оклад мин', 'Оклад макс', 'ФОТ/мес', 'ФОТ/год (с взносами)', 'Работы (номера IDEF0)']);
  for (const r of roleFots(org)) {
    rows.push([
      'Роль',
      r.dep.name,
      r.role.name,
      r.role.grade,
      num(r.role.fte),
      num(r.role.salaryMin),
      num(r.role.salaryMax),
      num(r.fotMonth),
      num(r.fotYear),
      (r.role.works ?? []).map((w) => works.get(w)?.num ?? w).join(' '),
    ]);
  }
  for (const d of depFots(org)) {
    rows.push(['Отдел', d.dep.name, '', '', num(d.fte), '', '', num(d.fotMonth), num(d.fotYear), num(d.share * 100) + '%']);
  }
  const s = orgSummary(org);
  rows.push(['Итого', '', '', '', num(s.totalFte), '', '', num(s.fotMonth), num(s.fotYear), '']);
  rows.push(['Юнит-экономика', 'Цена обращения L1', num(s.ticketPrice), 'Обращений на объект/год', num(s.siteTicketsYear), 'Стоимость объекта/год', num(s.costPerSiteYear), '', '', '']);
  const head = rows[0].map(quote).join(';');
  const body = rows.slice(1).map((row) => row.map((cell) => quote(cell)).join(';'));
  return '﻿' + [head, ...body].join('\r\n');
}

/** Положения об отделах и должностные инструкции в один Markdown-файл. */
export function orgDocsMd(org: OrgData, model: Model): string {
  const works = workIndex(model);
  const cost = workFot(org);
  const lines: string[] = [
    `# Оргдокументы — ${model.meta.name}`,
    '',
    `Сгенерировано из IDEF0-модели. Взносы: +${Math.round(org.params.socialRate * 1000) / 10}%.`,
    '',
  ];

  for (const dep of org.departments) {
    const depRoles = roleFots(org).filter((r) => r.dep.id === dep.id);
    const depWorks = new Map<string, Set<string>>();
    for (const r of depRoles) {
      for (const wid of r.role.works ?? []) {
        if (!depWorks.has(wid)) depWorks.set(wid, new Set());
        depWorks.get(wid)!.add(r.role.name);
      }
    }
    lines.push(
      '---', '',
      `# Положение об отделе «${dep.name}»`, '',
      '## Назначение', '',
      dep.mission || '(заполнить миссию отдела)', '',
      '## Штат', '',
      '| Роль | Грейд | FTE | Вилка оклада, ₽/мес |', '|---|---|---|---|',
    );
    for (const r of depRoles) {
      lines.push(`| ${r.role.name} | ${r.role.grade} | ${r.role.fte} | ${r.role.salaryMin.toLocaleString('ru-RU')} — ${r.role.salaryMax.toLocaleString('ru-RU')} |`);
    }
    lines.push('', '## Функции отдела (из модели)', '');
    for (const [wid, rnames] of [...depWorks.entries()].sort((a, b) => (works.get(a[0])?.num ?? '').localeCompare(works.get(b[0])?.num ?? ''))) {
      const w = works.get(wid);
      if (!w) continue;
      lines.push(`- **${w.num}. ${w.name}**${w.note ? ` — *${w.note}*` : ''} (исполнители: ${[...rnames].join(', ')})`);
    }
    lines.push('');
  }

  for (const r of roleFots(org)) {
    lines.push(
      '---', '',
      `# ДИ — ${r.role.name}`, '',
      `Отдел: ${r.dep.name}. Грейд: ${r.role.grade}. Оклад: ${r.role.salaryMin.toLocaleString('ru-RU')} — ${r.role.salaryMax.toLocaleString('ru-RU')} ₽/мес.`,
      '',
      '## Место в процессах', '',
    );
    const roleWorks = (r.role.works ?? []).map((wid) => works.get(wid)).filter(Boolean) as WorkInfo[];
    for (const w of roleWorks) {
      lines.push(`- **${w.num}. ${w.name}**${w.note ? ` — *${w.note}*` : ''}`);
    }
    lines.push('', '## KPI', '');
    const kpis = roleWorks.flatMap((w) => kpiOf(w.note).map((k) => `- ${w.num}: ${k}`));
    lines.push(...(kpis.length ? kpis : ['- (заполнить владельцем процесса)']));
    lines.push('', '## Стоимость роли', '', `- ФОТ/год с взносами: **${formatRub(r.fotYear)}**`, '');
  }

  const s = orgSummary(org);
  lines.push(
    '---', '',
    '# Сводка', '',
    `- Штатных единиц: ${s.totalFte}`,
    `- ФОТ/мес: ${formatRub(s.fotMonth)}; ФОТ/год с взносами: ${formatRub(s.fotYear)}`,
    `- Цена обращения L1: ${formatRub(s.ticketPrice)}`,
    `- Стоимость поддержки объекта (год): ${formatRub(s.costPerSiteYear)}`,
    '',
    '## Стоимость работ (распределение ФОТ)', '',
    '| Работа | Название | ₽/год |', '|---|---|---|',
  );
  const wf = [...cost.entries()].sort((a, b) => b[1] - a[1]);
  for (const [wid, value] of wf) {
    const w = works.get(wid);
    if (w) lines.push(`| ${w.num} | ${w.name} | ${Math.round(value).toLocaleString('ru-RU')} |`);
  }
  return lines.join('\n') + '\n';
}
