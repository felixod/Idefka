import type { Model, OrgData, OrgDepartment, OrgRole } from './types';
export type { OrgDepartment };
import { boxNumber, diagramOrder } from './query';

export const DEFAULT_ORG_PARAMS = {
  months: 12,
  socialRate: 0.302,
  overheadRate: 0.25,
  marginRate: 0.15,
  ticketsPerMonth: 1500,
  usersPerSite: 350,
  ticketsPerUserPerMonth: 0.8,
  sites: 8,
};

export const DEP_KIND_TITLE: Record<string, string> = {
  service: 'обслуживание (в договор)',
  development: 'развитие (проекты)',
  internal: 'обеспечение',
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

/** Дерево подразделений: управления → отделы. */
export interface DepNode {
  dep: OrgDepartment;
  children: DepNode[];
}

export function depTree(org: OrgData): DepNode[] {
  const nodes = new Map<string, DepNode>(org.departments.map((dep) => [dep.id, { dep, children: [] }]));
  const roots: DepNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.dep.parentId ? nodes.get(node.dep.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Согласованность оргструктуры и IDEF0-модели. */
export interface OrgIssue {
  kind: 'role' | 'dep' | 'work';
  text: string;
}

export function orgIssues(org: OrgData, model: Model): OrgIssue[] {
  const issues: OrgIssue[] = [];
  const works = workIndex(model);
  const rolesById = new Map(roleFots(org).map((r) => [r.role.id, r.role]));
  const assignedWorks = new Set<string>();

  for (const r of roleFots(org)) {
    if (!(r.role.works ?? []).length) issues.push({ kind: 'role', text: `Роль «${r.role.name}» не привязана ни к одной работе модели` });
    for (const wid of r.role.works ?? []) {
      if (!works.has(wid)) issues.push({ kind: 'role', text: `Роль «${r.role.name}»: работа ${wid} отсутствует в модели` });
      else assignedWorks.add(wid);
    }
    if (r.role.reportsTo && !rolesById.has(r.role.reportsTo)) {
      issues.push({ kind: 'role', text: `Роль «${r.role.name}»: руководитель ${r.role.reportsTo} не найден` });
    }
  }
  for (const dep of org.departments) {
    if (!(dep.goals ?? []).length) issues.push({ kind: 'dep', text: `У «${dep.name}» не заданы цели` });
    if (dep.parentId && !org.departments.some((d) => d.id === dep.parentId)) {
      issues.push({ kind: 'dep', text: `«${dep.name}»: вышестоящее управление ${dep.parentId} не найдено` });
    }
  }
  const serviceDeps = new Set(org.departments.filter((d) => d.kind === 'service').map((d) => d.id));
  for (const [wid, w] of works) {
    if (w.num === 'A0') continue;
    if (!assignedWorks.has(wid)) issues.push({ kind: 'work', text: `Работа ${w.num} «${w.name}» не покрыта ни одной ролью` });
  }
  if (!serviceDeps.size) issues.push({ kind: 'dep', text: 'Ни один отдел не помечен как обслуживание (kind=service) — цену договора посчитать нельзя' });
  return issues;
}

/** Цена договора на обслуживание. */
export interface ContractPrice {
  serviceFotYear: number; // ФОТ обслуживания (service-отделы)
  overhead: number; // накладные
  cost: number; // себестоимость обслуживания
  margin: number; // маржа
  priceYear: number; // цена договора в год
  priceMonth: number;
  pricePerSiteMonth: number;
  pricePerUserMonth: number;
  pricePerTicket: number;
}

export function contractPrice(org: OrgData): ContractPrice {
  const p = org.params;
  const serviceDeps = new Set(org.departments.filter((d) => d.kind === 'service').map((d) => d.id));
  const serviceFotYear = roleFots(org)
    .filter((r) => serviceDeps.has(r.dep.id))
    .reduce((sum, r) => sum + r.fotYear, 0);
  const overhead = serviceFotYear * p.overheadRate;
  const cost = serviceFotYear + overhead;
  const margin = cost * p.marginRate;
  const priceYear = cost + margin;
  const users = p.sites * p.usersPerSite;
  const ticketsYear = p.ticketsPerMonth * p.months;
  return {
    serviceFotYear,
    overhead,
    cost,
    margin,
    priceYear,
    priceMonth: priceYear / p.months,
    pricePerSiteMonth: priceYear / p.sites / p.months,
    pricePerUserMonth: users > 0 ? priceYear / users / p.months : 0,
    pricePerTicket: ticketsYear > 0 ? priceYear / ticketsYear : 0,
  };
}

export function kpiOf(note: string): string[] {
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
  const s = orgSummary(org);
  for (const d of depFots(org)) {
    rows.push(['Отдел', d.dep.name, '', '', num(d.fte), '', '', num(d.fotMonth), num(d.fotYear), num(d.share * 100) + '%']);
  }
  rows.push(['Итого', '', '', '', num(s.totalFte), '', '', num(s.fotMonth), num(s.fotYear), '']);
  rows.push(['Юнит-экономика', 'Цена обращения L1', num(s.ticketPrice), 'Обращений на объект/год', num(s.siteTicketsYear), 'Стоимость объекта/год', num(s.costPerSiteYear), '', '', '']);
  const c = contractPrice(org);
  rows.push(['Договор', 'ФОТ обслуживания/год', num(c.serviceFotYear), 'Накладные', num(c.overhead), 'Себестоимость', num(c.cost), 'Маржа', num(c.margin), '']);
  rows.push(['Договор', 'Цена/год', num(c.priceYear), 'Цена/мес', num(c.priceMonth), 'За объект/мес', num(c.pricePerSiteMonth), 'За пользователя/мес', num(c.pricePerUserMonth), 'За обращение ' + num(c.pricePerTicket)]);
  const head = rows[0].map(quote).join(';');
  const body = rows.slice(1).map((row) => row.map((cell) => quote(cell)).join(';'));
  return '﻿' + [head, ...body].join('\r\n');
}

/** Положения об отделах и должностные инструкции в один Markdown-файл. */
export function orgDocsMd(org: OrgData, model: Model): string {
  const works = workIndex(model);
  const roles = roleFots(org);
  const byId = new Map(roles.map((r) => [r.role.id, r]));
  const tree = depTree(org);
  const lines: string[] = [
    `# Оргдокументы — ${model.meta.name}`,
    '',
    `Сгенерировано из IDEF0-модели. Взносы: +${Math.round(org.params.socialRate * 1000) / 10}%.`,
    '',
    '## Иерархия подразделений',
    '',
  ];

  const dumpTree = (nodes: DepNode[], depth: number) => {
    for (const node of nodes) {
      lines.push(`${'  '.repeat(depth)}- **${node.dep.name}** (${DEP_KIND_TITLE[node.dep.kind] ?? node.dep.kind})`);
      if (node.dep.goals?.length) {
        for (const goal of node.dep.goals) lines.push(`${'  '.repeat(depth + 1)}- Цель: ${goal}`);
      }
      dumpTree(node.children, depth + 1);
    }
  };
  dumpTree(tree, 0);

  for (const dep of org.departments) {
    const depRoles = roles.filter((r) => r.dep.id === dep.id);
    const parent = dep.parentId ? org.departments.find((d) => d.id === dep.parentId) : undefined;
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
      '## Назначение и подчинённость', '',
      `- ${dep.mission || '(заполнить миссию отдела)'}`,
      parent ? `- Подчинённость: ${parent.name}` : '- Подчиняется непосредственно директору ИТ-компании',
      `- Тип: ${DEP_KIND_TITLE[dep.kind] ?? dep.kind}`,
      '',
      '## Цели и задачи отдела', '',
    );
    lines.push(...(dep.goals?.length ? dep.goals.map((g, i) => `${i + 1}. ${g}`) : ['(заполнить цели)']));
    lines.push('', '## Штат', '',
      '| Роль | Грейд | FTE | Подчиняется | Вилка оклада, ₽/мес |', '|---|---|---|---|---|');
    for (const r of depRoles) {
      const boss = r.role.reportsTo ? byId.get(r.role.reportsTo)?.role.name ?? r.role.reportsTo : '—';
      lines.push(`| ${r.role.name} | ${r.role.grade} | ${r.role.fte} | ${boss} | ${r.role.salaryMin.toLocaleString('ru-RU')} — ${r.role.salaryMax.toLocaleString('ru-RU')} |`);
    }
    lines.push('', '## Функции отдела (из модели)', '');
    for (const [wid, rnames] of [...depWorks.entries()].sort((a, b) => (works.get(a[0])?.num ?? '').localeCompare(works.get(b[0])?.num ?? ''))) {
      const w = works.get(wid);
      if (!w) continue;
      lines.push(`- **${w.num}. ${w.name}**${w.note ? ` — *${w.note}*` : ''} (исполнители: ${[...rnames].join(', ')})`);
    }
    lines.push('');
  }

  for (const r of roles) {
    const boss = r.role.reportsTo ? byId.get(r.role.reportsTo)?.role.name ?? r.role.reportsTo : 'директор ИТ-компании';
    lines.push(
      '---', '',
      `# ДИ — ${r.role.name}`, '',
      `Отдел: ${r.dep.name}. Грейд: ${r.role.grade}. Непосредственный руководитель: ${boss}. Условия оплаты — согласно штатному расписанию.`,
      '',
      '## Цели должности', '',
      ...(r.dep.goals?.length ? r.dep.goals.map((g) => `- ${g}`) : ['- (из целей отдела)']),
      '',
      '## Место в процессах и обязанности', '',
    );
    const roleWorks = (r.role.works ?? []).map((wid) => works.get(wid)).filter(Boolean) as WorkInfo[];
    for (const w of roleWorks) {
      lines.push(`- **${w.num}. ${w.name}**${w.note ? ` — *${w.note}*` : ''}`);
    }
    lines.push('', '## KPI', '');
    const kpis = roleWorks.flatMap((w) => kpiOf(w.note).map((k) => `- ${w.num}: ${k}`));
    lines.push(...(kpis.length ? kpis : ['- (заполнить владельцем процесса)']));
  }

  // Экономика и договор — не в оргдокументах: см. ABC-диалог и отчёт «Экономика.md».
  return lines.join('\n') + '\n';
}

// ============================================================ Шаблонатор документов
export const DEFAULT_TEMPLATES = {
  polozhenie: `# Положение об отделе «{{ОТДЕЛ}}»
{{КОМПАНИЯ}} · версия {{ВЕРСИЯ}} · {{ДАТА}}

## 1. Общие положения
{{ОБЩИЕ}}

## 2. Цели и задачи отдела
{{ЦЕЛИ}}

## 3. Структура и штатная численность
{{ТАБЛИЦА:ШТАТ}}
{{ШТАТ_ИТОГО}}

## 4. Функции отдела (из функциональной модели IDEF0)
{{ТАБЛИЦА:ФУНКЦИИ}}

## 5. Показатели эффективности
{{ТАБЛИЦА:KPI}}

## 6. Ресурсы и обеспечение
{{РЕСУРСЫ}}

## 7. Права и взаимодействие
{{ПРАВА}}`,
  di: `# Должностная инструкция — {{ДОЛЖНОСТЬ}}
{{КОМПАНИЯ}} · отдел «{{ОТДЕЛ}}» · грейд {{ГРЕЙД}}

## 1. Общие положения
{{ОБЩИЕ}}

## 2. Место в процессах (IDEF0) и обязанности
{{ТАБЛИЦА:ПРОЦЕССЫ}}

## 3. Показатели эффективности (KPI)
{{ТАБЛИЦА:KPI}}

## 4. Требования к знаниям
{{ЗНАНИЯ}}

## 5. Ресурсное обеспечение роли
{{РЕСУРСЫ}}

## 6. Права и ответственность
{{ПРАВА}}

Условия оплаты — согласно штатному расписанию. Согласовано: руководитель отдела. Ознакомлен: сотрудник.`,
};

/** Предложение по созданию должности для работы без ответственной роли. */
export interface RoleSuggestion {
  wid: string;
  workNum: string;
  workName: string;
  suggestedDepId: string;
  suggestedDepMissing: boolean;
  suggestedRoleName: string;
}

const DEP_BY_AREA: Array<[RegExp, string]> = [
  [/^A11/, 'SD'], [/^A114/, 'INFRA'], [/^A12/, 'INFRA'], [/^A13/, 'FIELD'],
  [/^A14/, 'SD'], [/^A2/, 'INFRA'], [/^A3/, 'DEVOPS'], [/^A4/, 'KNOW'],
  [/^A5/, 'FIN'], [/^A63/, 'FIL'], [/^A6/, 'IMPL'],
];

export function depForWork(num: string): string {
  for (const [re, dep] of DEP_BY_AREA) if (re.test(num)) return dep;
  return 'OPS';
}

export function coverageGaps(org: OrgData, model: Model): RoleSuggestion[] {
  const works = workIndex(model);
  const covered = new Set<string>();
  for (const r of roleFots(org)) for (const w of r.role.works ?? []) covered.add(w);
  const depIds = new Set(org.departments.map((d) => d.id));
  const out: RoleSuggestion[] = [];
  for (const [wid, w] of works) {
    if (covered.has(wid) || w.num === 'A0') continue;
    const depId = depForWork(w.num);
    const firstLine = w.name.split('\n')[0].replace(/^(Выполнять|Вести|Обеспечивать|Администрировать|Проводить)\s+/i, '');
    out.push({
      wid,
      workNum: w.num,
      workName: w.name,
      suggestedDepId: depId,
      suggestedDepMissing: !depIds.has(depId),
      suggestedRoleName: firstLine.slice(0, 60),
    });
  }
  return out.sort((a, b) => a.workNum.localeCompare(b.workNum));
}

export function upsertRole(org: OrgData, depId: string, role: {
  name: string; grade?: string; salaryMin?: number; salaryMax?: number; fte?: number; works: string[];
}): void {
  const dep = org.departments.find((d) => d.id === depId);
  if (!dep) return;
  const rid = 'u' + Math.random().toString(36).slice(2, 8);
  dep.roles.push({
    id: rid, name: role.name, grade: role.grade ?? 'Middle',
    salaryMin: role.salaryMin ?? 80000, salaryMax: role.salaryMax ?? 140000,
    fte: role.fte ?? 1, works: role.works, note: 'создана из конструктора процессов',
  });
}

export function createDepartment(org: OrgData, name: string, kind: OrgDepartment['kind'], parentId?: string): string {
  const id = 'd' + Math.random().toString(36).slice(2, 8);
  org.departments.push({ id, name, kind, mission: '', goals: [], parentId, roles: [] });
  return id;
}
