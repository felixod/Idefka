// Модельный аудит: кросс-нотационная согласованность (правила CR-01..CR-25).
// Ядро не зависит от UI: индексы строятся один раз за прогон, правила — чистые функции над контекстом.
// Синтаксические локальные проверки остаются в validate.ts; здесь только связи МЕЖДУ нотациями.
//
// Соглашения:
//  - A-номер работы считается портом boxNumber (query.ts) и стабилен внутри одного файла;
//  - связь «элемент → функция» вычисляется по тегу [A-номер] в названии элемента
//    (поддерживаются списки «[A244, A42]» и диапазоны «[A31-A32]», «[A1..A6]»);
//  - NAME-связь — нормализованное совпадение имён (нижний регистр, без пунктуации,
//    лёгкий стемминг русских окончаний) с опциональной таблицей алиасов;
//  - LEX-связь — Жаккар по значимым токенам (русские стоп-слова отбрасываются), порог 0.34;
//  - обход правила (waiver) — «[waiver:CR-04 причина]» в note элемента: находка уходит
//    в report.waived и не считается нарушением.

import type { Model, NodeKind, Notation, OrgRole, OrgDepartment } from './types';
import { boxNumber, diagramOrder, labelOf, ROLE_BY_SIDE, type Role as IcomRole } from './query';

export const RULES_VERSION = '1.0.0';
export const REPORT_SCHEMA = '1.0';

// ============================================================ Типы отчёта

export type AuditLevel = 'ERROR' | 'WARN' | 'INFO';
export type AuditCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export interface Finding {
  rule: string; // 'CR-04'
  level: AuditLevel;
  text: string;
  diagramId?: string; // минимальная точка перехода
  boxId?: string;
  arrowId?: string;
  hint?: string;
}

export interface RuleDescriptor {
  id: string;
  level: AuditLevel;
  category: AuditCategory;
  title: string;
  description: string;
  run: (ctx: AuditContext) => Finding[];
  /** Текст для зелёного каркаса (метрика правила), показывается при нуле находок. */
  passDetail?: (ctx: AuditContext) => string;
}

export interface RuleOutcome {
  rule: string;
  title: string;
  level: AuditLevel;
  category: AuditCategory;
  description: string;
  findings: Finding[];
  waived: Finding[];
  passDetail?: string;
}

export interface AuditGroup {
  key: AuditCategory;
  title: string;
  outcomes: RuleOutcome[];
  error: number;
  warn: number;
  info: number;
}

export interface CoverageRow {
  num: string;
  name: string;
  diagramId: string;
  boxId: string;
  dfd: number;
  bpmn: number;
  idef3: number;
  epc: number;
  act: number;
  uc: number;
  seq: number;
  org: number;
}

export interface AuditReport {
  summary: { error: number; warn: number; info: number; waived: number };
  findings: Finding[]; // отсортировано: уровень → категория → правило → текст
  waived: Finding[];
  passes: { rule: string; title: string; detail: string }[];
  groups: AuditGroup[];
  coverage: {
    leafWorks: number;
    byNotation: { bpmn: number; idef3: number; epc: number; act: number; anyProcess: number; dfd: number; uc: number; org: number };
    rows: CoverageRow[];
  };
  durationMs: number;
}

// ============================================================ Индексы

export interface WorkRef {
  id: string; // id бокса работы
  num: string; // A-номер (boxNumber)
  name: string;
  note: string;
  diagramId: string;
  leaf: boolean;
  child?: string; // id диаграммы-декомпозиции
  parentNum?: string; // номер родительской работы (A0 для работ верхнего уровня)
}

export interface TagRef {
  diagramId: string;
  boxId?: string;
  arrowId?: string;
  kind: NodeKind | 'message';
  notation: Notation;
  name: string;
}

export interface CoverageSlots {
  dfd: TagRef[];
  bpmn: TagRef[];
  idef3: TagRef[];
  epc: TagRef[];
  act: TagRef[];
  uc: TagRef[];
  seq: TagRef[];
  org: TagRef[];
}

export type NameKind = 'role' | 'dep' | 'external' | 'entity' | 'class' | 'orgUnit' | 'lifeline' | 'actor' | 'store' | 'component';

export interface NameRef {
  kind: NameKind;
  name: string;
  diagramId?: string;
  boxId?: string;
  role?: OrgRole;
  dep?: OrgDepartment;
}

/** Алиасы: kind → { исходное имя → целевое имя }. Цель сверяется нормализованно. */
export type AliasTable = Partial<Record<NameKind, Record<string, string>>>;

interface IcomInfo {
  labels: string[]; // уникальные подписи всех стрелок работы
  byRole: Record<IcomRole, string[]>;
}

export interface AuditContext {
  model: Model;
  /** id бокса → работа (только idef0, «первый id выигрывает», как org.ts:workIndex). */
  works: Map<string, WorkRef>;
  /** A-номер → id работы. */
  byNum: Map<string, string>;
  /** Номера работ верхнего уровня (дети A0, в большой модели A1..A6). */
  topNums: string[];
  /** A-номер → ссылающиеся элементы по нотациям. */
  coverage: Map<string, CoverageSlots>;
  /** Подписи ICOM-стрелок работы (labelOf-цепочка к родителю). */
  icom: Map<string, IcomInfo>;
  /** Нормализованное имя → ссылки. */
  names: Map<string, NameRef[]>;
  roles: OrgRole[];
  deps: OrgDepartment[];
  /** id работы → имена ролей, у которых она в works. */
  workRoles: Map<string, string[]>;
  /** Метрики правил (CR-01: количество тегов и т.п.) — для passDetail. */
  ruleMetrics: Record<string, string>;
}

// ============================================================ Нормализация имён

const STOPWORDS = new Set([
  'и', 'в', 'во', 'на', 'с', 'со', 'по', 'для', 'из', 'у', 'к', 'ко', 'о', 'об', 'от', 'до',
  'или', 'не', 'за', 'при', 'что', 'чтобы', 'как', 'это', 'на', 'the', 'a',
]);

// Лёгкий русский стемминг: одно усечение известного окончания (стебель ≥ 3 букв), затем мягкий/твёрдый знак.
// Суффиксы «ий»/«ие» сознательно не в списке: их обрабатывает усечение «ь/й» ниже — иначе «обращение» и
// «обращения» дают разные стебли («обращен» против «обращени»).
const SUFFIXES = [
  'ами', 'ями', 'иях', 'ях', 'ах', 'ов', 'ев', 'ый', 'ой', 'ая', 'яя', 'ее', 'ые',
  'ей', 'ом', 'ем', 'ам', 'ям', 'ы', 'и', 'а', 'я', 'е', 'у', 'ю', 'о',
];

function stemWord(word: string): string {
  let w = word;
  if (/^[а-яё]+$/.test(w) && w.length >= 4) {
    for (const suf of SUFFIXES) {
      if (w.endsWith(suf) && w.length - suf.length >= 3) {
        w = w.slice(0, -suf.length);
        break;
      }
    }
  }
  if (w.length >= 5 && /[ьй]$/.test(w)) w = w.slice(0, -1);
  return w;
}

/** Полная нормализация имени для точного сравнения: lower, ё→е, без пунктуации, стемминг. */
export function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^0-9a-zа-я]+/)
    .filter(Boolean)
    .map(stemWord)
    .join(' ');
}

/** Значимые токены (без стоп-слов) для лексического пересечения. */
export function nameTokens(name: string): Set<string> {
  const out = new Set<string>();
  for (const raw of name.toLowerCase().replace(/ё/g, 'е').split(/[^0-9a-zа-я]+/)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    out.add(stemWord(raw));
  }
  return out;
}

function sharedTokens(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const t of a) if (b.has(t)) out.add(t);
  return out;
}

function containsTokens(small: Set<string>, big: Set<string>): boolean {
  if (!small.size) return false;
  for (const t of small) if (!big.has(t)) return false;
  return true;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  return sharedTokens(a, b).size / (a.size + b.size - sharedTokens(a, b).size);
}

/** Аббревиатуры пар соседних слов («база знаний» → «бз») для сопоставления с «БЗ», «КИ» и т.п. */
function pairAbbrevs(name: string): Set<string> {
  const words = name.toLowerCase().split(/[^0-9a-zа-яё]+/).filter((w) => w.length >= 3);
  const out = new Set<string>();
  for (let i = 0; i + 1 < words.length; i++) out.add(words[i][0] + words[i + 1][0]);
  return out;
}

function isAbbrevToken(token: string): boolean {
  return /^[а-яa-z]{2,3}$/.test(token);
}

// ============================================================ Разбор тегов [A-номер]

/** Теги [A-номера] из названия: списки, диапазоны «A31-A32» и «A1..A6» (равная длина номера). */
export function parseTags(name: string): string[] {
  const nums: string[] = [];
  for (const group of name.matchAll(/\[([^\[\]]*)\]/g)) {
    for (const part of group[1].split(/[,;]|\s+/)) {
      const p = part.trim();
      if (!p) continue;
      const range = /^(A\d+)(?:-|\.\.)(A\d+)$/.exec(p);
      if (range) {
        const [, from, to] = range;
        if (from.length === to.length && from <= to) {
          for (let i = Number(from.slice(1)); i <= Number(to.slice(1)); i++) nums.push(`A${i}`);
        } else {
          nums.push(from, to);
        }
      } else if (/^A\d+$/.test(p)) {
        nums.push(p);
      }
    }
  }
  return nums;
}

const WAIVER_RE = (rule: string) => new RegExp(`\\[waiver:${rule}(\\s|\\]|—|-)`, 'i');

function boxWaived(model: Model, diagramId: string | undefined, boxId: string | undefined, rule: string): boolean {
  if (!diagramId || !boxId) return false;
  const box = model.diagrams[diagramId]?.boxes.find((b) => b.id === boxId);
  return !!box && WAIVER_RE(rule).test(box.note ?? '');
}

function arrowWaived(model: Model, diagramId: string | undefined, arrowId: string | undefined, rule: string): boolean {
  if (!diagramId || !arrowId) return false;
  const arrow = model.diagrams[diagramId]?.arrows.find((a) => a.id === arrowId);
  return !!arrow && WAIVER_RE(rule).test(arrow.note ?? '');
}

// ============================================================ Построение контекста

const TAG_KIND_SLOT: Partial<Record<NodeKind, keyof CoverageSlots>> = {
  process: 'dfd',
  task: 'bpmn',
  uow: 'idef3',
  epcFunction: 'epc',
  action: 'act',
  useCase: 'uc',
  lifeline: 'seq',
  actorLine: 'seq',
};

/** Виды, чьи теги [A-номера] проверяются на существование работ (CR-01). */
const CR01_KINDS = new Set<NodeKind>(['task', 'uow', 'epcFunction', 'action', 'process', 'useCase', 'lifeline', 'actorLine', 'epcEvent']);
/** Процессные элементы, обязанные нести тег (CR-03). */
const CR03_KINDS = new Set<NodeKind>(['task', 'uow', 'action', 'epcFunction', 'process']);

export function buildContext(model: Model): AuditContext {
  const works = new Map<string, WorkRef>();
  const byNum = new Map<string, string>();

  for (const diagramId of diagramOrder(model, 'idef0')) {
    const diagram = model.diagrams[diagramId];
    for (const box of diagram.boxes) {
      if (box.kind !== 'activity' || works.has(box.id)) continue;
      const num = boxNumber(model, diagramId, box.id);
      const parent = diagram.parent;
      const parentNum = parent ? boxNumber(model, parent.diagram, parent.box) : undefined;
      works.set(box.id, {
        id: box.id,
        num,
        name: box.name.replace(/\n/g, ' '),
        note: (box.note ?? '').trim(),
        diagramId,
        leaf: !box.child,
        child: box.child,
        parentNum,
      });
      if (!byNum.has(num)) byNum.set(num, box.id);
    }
  }

  // Работы верхнего уровня: дети A0 (боксы диаграммы, родитель которой — контекст).
  const topNums: string[] = [];
  const idef0Root = model.roots.idef0;
  for (const diagram of Object.values(model.diagrams)) {
    if (diagram.notation !== 'idef0' || diagram.parent?.diagram !== idef0Root) continue;
    for (const box of diagram.boxes) {
      if (box.kind === 'activity') topNums.push(boxNumber(model, diagram.id, box.id));
    }
  }

  // Покрытие: теги сателлитных нотаций + сообщения sequence + role.works.
  const coverage = new Map<string, CoverageSlots>();
  const slotOf = (num: string): CoverageSlots => {
    let slots = coverage.get(num);
    if (!slots) {
      slots = { dfd: [], bpmn: [], idef3: [], epc: [], act: [], uc: [], seq: [], org: [] };
      coverage.set(num, slots);
    }
    return slots;
  };

  for (const diagram of Object.values(model.diagrams)) {
    for (const box of diagram.boxes) {
      const slot = TAG_KIND_SLOT[box.kind];
      if (!slot) continue;
      for (const num of parseTags(box.name)) slotOf(num)[slot].push({ diagramId: diagram.id, boxId: box.id, kind: box.kind, notation: diagram.notation, name: box.name });
    }
    if (diagram.notation === 'sequence') {
      for (const arrow of diagram.arrows) {
        for (const num of parseTags(arrow.label)) {
          slotOf(num).seq.push({ diagramId: diagram.id, arrowId: arrow.id, kind: 'message', notation: diagram.notation, name: arrow.label });
        }
      }
    }
  }

  const roles: OrgRole[] = [];
  const deps: OrgDepartment[] = [];
  const workRoles = new Map<string, string[]>();
  for (const dep of model.org?.departments ?? []) {
    deps.push(dep);
    for (const role of dep.roles ?? []) {
      roles.push(role);
      for (const wid of role.works ?? []) {
        const list = workRoles.get(wid) ?? [];
        list.push(role.name);
        workRoles.set(wid, list);
      }
    }
  }
  for (const [wid, roleNames] of workRoles) {
    const work = works.get(wid);
    if (work) slotOf(work.num).org.push(...roleNames.map((name) => ({ diagramId: work.diagramId, boxId: work.id, kind: 'task' as NodeKind, notation: 'idef0' as Notation, name })));
  }

  // ICOM-подписи работ. Роль стрелки считается со стороны САМОЙ работы:
  // вход/управление/механизм — стрелки, входящие в грань работы; выход — исходящие.
  // Стрелка «низ → низ» (выход в механизм другой работы) даёт M только цели, но не источнику.
  const icom = new Map<string, IcomInfo>();
  for (const work of works.values()) {
    const diagram = model.diagrams[work.diagramId];
    const byRole: Record<IcomRole, string[]> = { I: [], C: [], O: [], M: [] };
    const seen = new Set<string>();
    const seenByRole: Record<IcomRole, Set<string>> = { I: new Set(), C: new Set(), O: new Set(), M: new Set() };
    for (const arrow of diagram.arrows) {
      const endsHere = arrow.to.t === 'box' && arrow.to.box === work.id ? arrow.to : null;
      const startsHere = arrow.from.t === 'box' && arrow.from.box === work.id ? arrow.from : null;
      if (!endsHere && !startsHere) continue;
      const label = labelOf(model, arrow).trim();
      if (!label) continue;
      seen.add(label);
      // Одна и та же подпись законно числится и выходом, и механизмом (ветвление стрелки):
      // дедупликация — внутри роли, но не между ролями.
      if (endsHere) {
        const role = ROLE_BY_SIDE[endsHere.side];
        if (!seenByRole[role].has(label)) {
          seenByRole[role].add(label);
          byRole[role].push(label);
        }
      } else if (startsHere && !seenByRole.O.has(label)) {
        seenByRole.O.add(label);
        byRole.O.push(label);
      }
    }
    icom.set(work.num, { labels: [...seen], byRole });
  }

  // Индекс имён для NAME-связей.
  const names = new Map<string, NameRef[]>();
  const addName = (kind: NameKind, name: string, ref: Omit<NameRef, 'kind' | 'name'> = {}) => {
    const key = normName(name);
    if (!key) return;
    const list = names.get(key) ?? [];
    list.push({ kind, name, ...ref });
    names.set(key, list);
  };
  for (const role of roles) addName('role', role.name, { role });
  for (const dep of deps) addName('dep', dep.name, { dep });
  for (const diagram of Object.values(model.diagrams)) {
    for (const box of diagram.boxes) {
      const ref = { diagramId: diagram.id, boxId: box.id };
      if (box.kind === 'external') addName('external', box.name, ref);
      else if (box.kind === 'entity') addName('entity', box.name, ref);
      else if (box.kind === 'class' || box.kind === 'interface' || box.kind === 'enumeration') addName('class', box.name, ref);
      else if (box.kind === 'orgUnit') addName('orgUnit', box.name, ref);
      else if (box.kind === 'store') addName('store', box.name, ref);
      else if (box.kind === 'lifeline') addName('lifeline', box.name, ref);
      else if (box.kind === 'actorLine') addName('lifeline', box.name, ref);
      else if (box.kind === 'actor') addName('actor', box.name, ref);
      else if (box.kind === 'deployNode' || box.kind === 'device' || box.kind === 'component' || box.kind === 'artifact') {
        addName('component', box.name, ref);
      }
    }
  }

  return { model, works, byNum, topNums, coverage, icom, names, roles, deps, workRoles, ruleMetrics: {} };
}

// ============================================================ Хелперы правил

type FindingInit = Omit<Finding, 'rule' | 'level'>;

function finding(level: AuditLevel, init: FindingInit): Finding {
  return { rule: '', level, ...init };
}

/** Точное NAME-совпадение с учётом алиасов: normName равен или алиас ведёт к цели (точно или по вложению токенов). */
function exactMatch(ctx: AuditContext, name: string, kind: NameKind, aliases?: AliasTable): NameRef | undefined {
  const key = normName(name);
  const direct = (ctx.names.get(key) ?? []).find((r) => r.kind === kind);
  if (direct) return direct;
  const alias = aliases?.[kind]?.[name];
  if (!alias) return undefined;
  const target = normName(alias);
  const ref = (ctx.names.get(target) ?? []).find((r) => r.kind === kind);
  if (ref) return ref;
  // Цель-фрагмент: все токены алиаса входят в имя кандидата.
  const aliasTokens = nameTokens(alias);
  if (!aliasTokens.size) return undefined;
  return findAllOfKind(ctx, kind).find((r) => containsTokens(aliasTokens, nameTokens(r.name)));
}

function findAllOfKind(ctx: AuditContext, kind: NameKind): NameRef[] {
  const out: NameRef[] = [];
  for (const list of ctx.names.values()) for (const r of list) if (r.kind === kind) out.push(r);
  return out;
}

/** Нечёткое совпадение (токены кандидата целиком входят в имя цели) — для диагностики «нужен алиас». */
function fuzzyMatch(ctx: AuditContext, name: string, kind: NameKind): NameRef | undefined {
  const tokens = nameTokens(name);
  if (!tokens.size) return undefined;
  return findAllOfKind(ctx, kind).find((r) => containsTokens(tokens, nameTokens(r.name)));
}

/** Слабое совпадение — хотя бы один общий значимый токен (для хранилищ, внешних сущностей). */
function overlapMatch(ctx: AuditContext, name: string, kind: NameKind): NameRef | undefined {
  const tokens = nameTokens(name);
  if (!tokens.size) return undefined;
  const abbrevs = pairAbbrevs(name);
  return findAllOfKind(ctx, kind).find((r) => {
    const other = nameTokens(r.name);
    if (sharedTokens(tokens, other).size) return true;
    if (!abbrevs.size) return false;
    for (const t of other) if (isAbbrevToken(t) && abbrevs.has(t)) return true;
    return false;
  });
}

const leafWorks = (ctx: AuditContext): WorkRef[] => [...ctx.works.values()].filter((w) => w.leaf && w.num !== 'A0');

function workRefByNum(ctx: AuditContext, num: string): WorkRef | undefined {
  const id = ctx.byNum.get(num);
  return id ? ctx.works.get(id) : undefined;
}

function diagramTitle(model: Model, diagramId: string): string {
  const diagram = model.diagrams[diagramId];
  if (!diagram) return diagramId;
  const parent = diagram.parent;
  const parentBox = parent ? model.diagrams[parent.diagram]?.boxes.find((b) => b.id === parent.box) : undefined;
  return parentBox?.name.replace(/\n/g, ' ') ?? diagram.id;
}

const procSlots: (keyof CoverageSlots)[] = ['bpmn', 'idef3', 'epc', 'act'];

// ============================================================ Реестр правил CR-01..CR-25

export const RULES: RuleDescriptor[] = [
  // ---------------- Категория A. Трассировка и идентификаторы
  {
    id: 'CR-01',
    level: 'ERROR',
    category: 'A',
    title: 'Теги [A-номера] указывают на существующие работы',
    description:
      'Для каждого элемента видов {задача BPMN, UOW IDEF3, функция EPC, действие Activity, процесс DFD, прецедент, линия жизни, событие EPC} каждый разобранный тег [A-номер] (включая развёрнутые диапазоны) должен существовать в нумерации работ IDEF0.',
    run: (ctx) => {
      const out: Finding[] = [];
      let total = 0;
      for (const diagram of Object.values(ctx.model.diagrams)) {
        for (const box of diagram.boxes) {
          if (!CR01_KINDS.has(box.kind)) continue;
          for (const num of parseTags(box.name)) {
            total++;
            if (ctx.byNum.has(num)) continue;
            out.push(
              finding('ERROR', {
                text: `Тег [${num}] в названии «${box.name.replace(/\n/g, ' ')}» (${diagram.id}) указывает на несуществующую работу`,
                diagramId: diagram.id,
                boxId: box.id,
                hint: `Работы ${num} нет в IDEF0-модели: исправьте номер или декомпозируйте родительскую работу.`,
              }),
            );
          }
        }
      }
      ctx.ruleMetrics['CR-01'] = `тегов: ${total}`;
      return out;
    },
    passDetail: (ctx) => `${ctx.ruleMetrics['CR-01'] ?? '0 тегов'}, битых ссылок нет`,
  },
  {
    id: 'CR-02',
    level: 'ERROR',
    category: 'A',
    title: 'Id работ IDEF0 не конфликтуют с id элементов других нотаций',
    description:
      'workIndex строится по idef0-диаграммам; если id работы совпадает с id бокса другой нотации, внешние инструменты (CI, экспорт, переход «к элементу») не могут однозначно резолвить ссылку, а role.works становится двусмысленной.',
    run: (ctx) => {
      const foreign = new Map<string, string[]>();
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation === 'idef0') continue;
        for (const box of diagram.boxes) {
          if (!ctx.works.has(box.id)) continue;
          const list = foreign.get(box.id) ?? [];
          list.push(diagram.id);
          foreign.set(box.id, list);
        }
      }
      return [...foreign.entries()].map(([boxId, diagramIds]) => {
        const work = ctx.works.get(boxId)!;
        return finding('ERROR', {
          text: `Id работы ${work.num} «${work.name}» (${work.diagramId}) совпадает с id элементов других нотаций: ${diagramIds.join(', ')} — ссылки role.works двусмысленны`,
          diagramId: work.diagramId,
          boxId: work.id,
          hint: 'Переименуйте id элементов сателлитных нотаций: id должен быть уникален в пределах модели.',
        });
      });
    },
  },
  {
    id: 'CR-03',
    level: 'ERROR',
    category: 'A',
    title: 'Процессный элемент имеет тег [A-номер]',
    description:
      'Задачи BPMN, UOW IDEF3, действия Activity, функции EPC и процессы DFD обязаны ссылаться на работу IDEF0 тегом [A-номер] в названии (обход — «[waiver:CR-03 причина]» в note).',
    run: (ctx) => {
      const out: Finding[] = [];
      for (const diagram of Object.values(ctx.model.diagrams)) {
        for (const box of diagram.boxes) {
          if (!CR03_KINDS.has(box.kind)) continue;
          if (parseTags(box.name).length) continue;
          if (boxWaived(ctx.model, diagram.id, box.id, 'CR-03')) continue;
          out.push(
            finding('ERROR', {
              text: `«${box.name.replace(/\n/g, ' ')}» (${diagram.id}) не привязан(а) к работе IDEF0: в названии нет тега [A-номер]`,
              diagramId: diagram.id,
              boxId: box.id,
              hint: 'Добавьте тег работы в название, например «Проверить ЗИП [A135]», или зафиксируйте обход в note: [waiver:CR-03 …].',
            }),
          );
        }
      }
      return out;
    },
  },

  // ---------------- Категория B. Функции → процессы
  {
    id: 'CR-04',
    level: 'ERROR',
    category: 'B',
    title: 'Каждая листовая функция покрыта процессной нотацией',
    description:
      '«Каждая функция рождает процесс»: у каждой листовой (недекомпозированной) работы IDEF0 должен быть хотя бы один процессный элемент с её тегом — задача BPMN, UOW IDEF3, функция EPC или действие Activity.',
    run: (ctx) =>
      leafWorks(ctx)
        .filter((w) => !procSlots.some((slot) => (ctx.coverage.get(w.num)?.[slot] ?? []).length))
        .map((w) =>
          finding('ERROR', {
            text: `Листовая работа ${w.num} «${w.name}» не покрыта ни одной процессной нотацией (BPMN/IDEF3/EPC/Activity)`,
            diagramId: w.diagramId,
            boxId: w.id,
            hint: `Добавьте BPMN-задачу, UOW, функцию EPC или действие Activity с тегом [${w.num}] — либо пометьте работу [waiver:CR-04] в note.`,
          }),
        ),
    passDetail: (ctx) => `${leafWorks(ctx).length} листовых работ покрыты процессными нотациями`,
  },
  {
    id: 'CR-05',
    level: 'ERROR',
    category: 'B',
    title: 'Функция верхнего уровня имеет DFD-процесс',
    description:
      '«Функции и потоки данных влияют на процессы»: у каждой работы верхнего уровня (ребёнка A0) должен быть контекстный DFD-процесс с её тегом (связь 1..1).',
    run: (ctx) =>
      ctx.topNums
        .filter((num) => !(ctx.coverage.get(num)?.dfd ?? []).length)
        .map((num) => {
          const work = workRefByNum(ctx, num);
          return finding('ERROR', {
            text: `У функции верхнего уровня ${num} «${work?.name ?? ''}» нет DFD-процесса с тегом [${num}]`,
            diagramId: work?.diagramId,
            boxId: work?.id,
            hint: `Добавьте на контекстную DFD процесс «… [${num}]» — поток данных этой функции.`,
          });
        }),
    passDetail: (ctx) => `${ctx.topNums.length} функций верхнего уровня имеют DFD-процессы`,
  },
  {
    id: 'CR-06',
    level: 'WARN',
    category: 'B',
    title: 'DFD-процесс декомпозированной функции сам декомпозирован',
    description:
      'Если работа раскрыта в IDEF0 (есть дочерняя диаграмма), её DFD-процесс логично раскрыть тоже — иначе уровни детализации расходятся. Проверяются DFD-процессы с тегом декомпозированной работы.',
    run: (ctx) => {
      const out: Finding[] = [];
      for (const work of ctx.works.values()) {
        if (work.leaf || work.num === 'A0') continue;
        const procs = ctx.coverage.get(work.num)?.dfd ?? [];
        if (!procs.length) continue; // нет DFD-процесса вовсе — территория CR-05
        const decomposed = procs.some((ref) => {
          const box = ref.boxId ? ctx.model.diagrams[ref.diagramId]?.boxes.find((b) => b.id === ref.boxId) : undefined;
          return !!box?.child;
        });
        if (!decomposed) {
          const first = procs[0];
          out.push(
            finding('WARN', {
              text: `Работа ${work.num} «${work.name}» декомпозирована, а её DFD-процесс «${first.name.replace(/\n/g, ' ')}» (${first.diagramId}) — нет: уровни детализации расходятся`,
              diagramId: first.diagramId,
              boxId: first.boxId,
              hint: `Раскройте DFD-процесс дочерней диаграммой или поднимите детализацию IDEF0.`,
            }),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'CR-07',
    level: 'WARN',
    category: 'B',
    title: 'Листовая функция покрыта DFD-процессом',
    description:
      'Детализация потоков по листовым функциям желательна: у листовой работы IDEF0 должен быть DFD-процесс с её тегом. Допустимы функции без собственных потоков (чисто управляющие) — тогда фиксируется предупреждение.',
    run: (ctx) =>
      leafWorks(ctx)
        .filter((w) => !(ctx.coverage.get(w.num)?.dfd ?? []).length)
        .map((w) =>
          finding('WARN', {
            text: `Листовая работа ${w.num} «${w.name}» не имеет DFD-процесса: потоки данных функции не описаны`,
            diagramId: w.diagramId,
            boxId: w.id,
            hint: `Добавьте DFD-процесс «… [${w.num}]» на диаграмму детализации родительской функции.`,
          }),
        ),
    passDetail: (ctx) => `${leafWorks(ctx).length} листовых работ покрыты DFD-процессами`,
  },
  {
    id: 'CR-08',
    level: 'ERROR',
    category: 'B',
    title: 'У функции верхнего уровня есть исполнитель (M-стрелка)',
    description:
      '«Всё это влияет на оргструктуру»: у каждой функции верхнего уровня (ребёнка A0) должна быть хотя бы одна M-стрелка (механизм, вход в нижнюю грань) — точка входа оргструктуры в IDEF0.',
    run: (ctx) =>
      ctx.topNums
        .filter((num) => !(ctx.icom.get(num)?.byRole.M ?? []).length)
        .map((num) => {
          const work = workRefByNum(ctx, num);
          return finding('ERROR', {
            text: `У функции верхнего уровня ${num} «${work?.name ?? ''}» нет ни одной M-стрелки (механизма-исполнителя) на диаграмме ${work?.diagramId ?? ''}`,
            diagramId: work?.diagramId,
            boxId: work?.id,
            hint: 'Проведите стрелку в нижнюю грань работы: роль/подразделение, инструмент или систему-механизм.',
          });
        }),
    passDetail: (ctx) => `${ctx.topNums.length} функций верхнего уровня имеют механизмы-исполнители`,
  },
  {
    id: 'CR-09',
    level: 'WARN',
    category: 'B',
    title: 'Выход функции покидает правую грань',
    description:
      'У каждой работы IDEF0 должен быть собственный выход: хотя бы одна исходящая стрелка с правой грани. Стрелки «низ → низ» (выход в механизм другой работы) допустимы, но не заменяют выхода.',
    run: (ctx) => {
      const out: Finding[] = [];
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'idef0') continue;
        for (const box of diagram.boxes) {
          if (box.kind !== 'activity') continue;
          const hasRight = diagram.arrows.some((a) => a.from.t === 'box' && a.from.box === box.id && a.from.side === 'right');
          if (hasRight) continue;
          const num = boxNumber(ctx.model, diagram.id, box.id);
          out.push(
            finding('WARN', {
              text: `Работа ${num} «${box.name.replace(/\n/g, ' ')}» (${diagram.id}) не имеет выхода с правой грани`,
              diagramId: diagram.id,
              boxId: box.id,
              hint: 'Результат работы должен покидать правую грань; «низ → низ» — это передача в механизм, а не выход.',
            }),
          );
        }
      }
      return out;
    },
  },

  // ---------------- Категория C. Данные: DFD ↔ IDEF0 ↔ ERD
  {
    id: 'CR-10',
    level: 'WARN',
    category: 'C',
    title: 'Поток DFD трассируется на ICOM своей функции',
    description:
      'Поток данных на DFD — «взгляд изнутри» на ICOM-стрелку функции: подпись потока, прикреплённого к процессу с тегом [A-номер], должна лексически сходиться с подписями стрелок этой работы (Жаккар ≥ 0.34). Проверяется контекстный уровень DFD (процессы — дети A0); на нижних уровнях потоки закономерно уточняют формулировки и лексическое совпадение слабее.',
    run: (ctx) => {
      const out: Finding[] = [];
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'dfd') continue;
        // Контекстный уровень: хотя бы один процесс тегирует работу верхнего уровня.
        const rootLevel = diagram.boxes.some((b) => b.kind === 'process' && parseTags(b.name).some((n) => ctx.topNums.includes(n)));
        if (!rootLevel) continue;
        const boxes = new Map(diagram.boxes.map((b) => [b.id, b]));
        for (const arrow of diagram.arrows) {
          const label = labelOf(ctx.model, arrow).trim();
          if (!label) continue;
          const fnNums = new Set<string>();
          for (const end of [arrow.from, arrow.to]) {
            if (end.t !== 'box') continue;
            const box = boxes.get(end.box);
            if (box?.kind === 'process') for (const num of parseTags(box.name)) fnNums.add(num);
          }
          if (!fnNums.size) continue;
          let best = 0;
          const flowTokens = nameTokens(label);
          for (const num of fnNums) {
            for (const icomLabel of ctx.icom.get(num)?.labels ?? []) {
              best = Math.max(best, jaccard(flowTokens, nameTokens(icomLabel)));
            }
          }
          if (best >= 0.34) continue;
          out.push(
            finding('WARN', {
              text: `Поток «${label}» (${diagram.id}) не трассируется лексически на ICOM-стрелки функций ${[...fnNums].join(', ')} (лучший Жаккар ${best.toFixed(2)})`,
              diagramId: diagram.id,
              arrowId: arrow.id,
              hint: 'Выровняйте словарь: подпись потока и подпись ICOM-стрелки одной функции должны пересекаться по значимым словам.',
            }),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'CR-11',
    level: 'WARN',
    category: 'C',
    title: 'Хранилище DFD отражено в ERD-сущности',
    description:
      '«Хранилища ↔ ERD-сущности»: данные, которые текут, должны иметь структуру. Хранилище считается отражённым, если его имя (полное, части до/после «:», по значимым токенам или аббревиатуре пары слов) совпадает с сущностью ERD, либо задан алиас.',
    run: (ctx) => {
      const out: Finding[] = [];
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'dfd') continue;
        for (const box of diagram.boxes) {
          if (box.kind !== 'store') continue;
          const match =
            exactMatch(ctx, box.name, 'entity') ??
            overlapMatch(ctx, box.name, 'entity') ??
            overlapMatch(ctx, box.name.split(':')[0] ?? '', 'entity') ??
            overlapMatch(ctx, box.name.split(':')[1] ?? '', 'entity');
          if (match) continue;
          out.push(
            finding('WARN', {
              text: `Хранилище «${box.name.replace(/\n/g, ' ')}» (${diagram.id}) не отражено ни в одной сущности ERD`,
              diagramId: diagram.id,
              boxId: box.id,
              hint: 'Добавьте сущность в ERD, переименуйте хранилище в соответствии со словарём модели или свяжите алиасом (model-audit.aliases.json).',
            }),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'CR-12',
    level: 'INFO',
    category: 'C',
    title: 'ERD-сущность имеет источник данных (DFD-хранилище)',
    description:
      'Не всякая сущность обязана быть хранилищем: сущности орг-мета (ПОДРАЗДЕЛЕНИЕ, РОЛЬ, РАБОТА IDEFO) закрываются allow-списком, остальные должны появляться в потоках данных как хранилища DFD.',
    run: (ctx) => {
      const ALLOW = new Set(['ПОДРАЗДЕЛЕНИЕ', 'РОЛЬ', 'РАБОТА IDEFO'].map(normName));
      const out: Finding[] = [];
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'erd') continue;
        for (const box of diagram.boxes) {
          if (box.kind !== 'entity') continue;
          if (ALLOW.has(normName(box.name))) continue;
          const match =
            exactMatch(ctx, box.name, 'store') ??
            overlapMatch(ctx, box.name, 'store') ??
            fuzzyMatch(ctx, box.name, 'store');
          if (match) continue;
          out.push(
            finding('INFO', {
              text: `Сущность «${box.name.replace(/\n/g, ' ')}» не имеет источника данных: ни одно хранилище DFD не соответствует ей`,
              diagramId: diagram.id,
              boxId: box.id,
              hint: 'Либо данные сущности текут в потоках (добавьте хранилище на DFD), либо сущность — орг-мета (расширьте allow-список).',
            }),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'CR-13',
    level: 'ERROR',
    category: 'C',
    title: 'ERD: у каждой сущности есть PK, у каждой связи задана кратность',
    description: 'Перенос синтаксических инвариантов ERD в единый реестр: сущность без первичного ключа и связь без кратности ломают целостность данных (PASS-гард).',
    run: (ctx) => {
      const out: Finding[] = [];
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'erd') continue;
        for (const box of diagram.boxes) {
          if (box.kind === 'entity' && !(box.keys ?? '').trim()) {
            out.push(
              finding('ERROR', {
                text: `У сущности «${box.name.replace(/\n/g, ' ')}» (${diagram.id}) не задан первичный ключ`,
                diagramId: diagram.id,
                boxId: box.id,
                hint: 'Заполните поле «Ключи» сущности, например «id_обращения».',
              }),
            );
          }
        }
        for (const arrow of diagram.arrows) {
          if (arrow.link !== 'identifying' && arrow.link !== 'nonIdentifying') continue;
          if (!arrow.card0 || !arrow.card1) {
            out.push(
              finding('ERROR', {
                text: `У связи «${labelOf(ctx.model, arrow) || arrow.id}» (${diagram.id}) не задана кратность`,
                diagramId: diagram.id,
                arrowId: arrow.id,
                hint: 'Укажите кратности обоих концов связи (1, 0..1, 1..n, 0..n).',
              }),
            );
          }
        }
      }
      return out;
    },
  },

  // ---------------- Категория D. События и логика процессов
  {
    id: 'CR-14',
    level: 'WARN',
    category: 'D',
    title: 'BPMN-шлюзы и события именованы',
    description: 'У каждого шлюза и события BPMN (начального, промежуточного, конечного) должно быть осмысленное название — условие или триггер.',
    run: (ctx) => {
      const out: Finding[] = [];
      const KINDS14 = new Set<NodeKind>(['gateway', 'startEvent', 'intermediateEvent', 'endEvent']);
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'bpmn') continue;
        for (const box of diagram.boxes) {
          if (!KINDS14.has(box.kind) || box.name.trim()) continue;
          out.push(
            finding('WARN', {
              text: `Безымянный элемент BPMN (${box.kind}) на диаграмме ${diagram.id}: у события/шлюза нет условия или триггера`,
              diagramId: diagram.id,
              boxId: box.id,
              hint: 'Назовите событие триггером («Инцидент P1»), а шлюз — условием ветвления.',
            }),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'CR-15',
    level: 'INFO',
    category: 'D',
    title: 'Словари событий EPC и BPMN связаны',
    description:
      'Доля событий EPC и событий/шлюзов BPMN, связанных перекрёстными тегами [A-номер], фиксируется метрикой. Если ни одного пересечения нет — словари двух нотаций живут параллельно (модельный уровень).',
    run: (ctx) => {
      let epcTotal = 0;
      let epcTagged = 0;
      let bpmnTotal = 0;
      let bpmnTagged = 0;
      for (const diagram of Object.values(ctx.model.diagrams)) {
        for (const box of diagram.boxes) {
          const tagged = parseTags(box.name).length > 0;
          if (box.kind === 'epcEvent') {
            epcTotal++;
            if (tagged) epcTagged++;
          } else if (diagram.notation === 'bpmn' && (box.kind === 'startEvent' || box.kind === 'intermediateEvent' || box.kind === 'endEvent' || box.kind === 'gateway')) {
            bpmnTotal++;
            if (tagged) bpmnTagged++;
          }
        }
      }
      ctx.ruleMetrics['CR-15'] = `EPC: ${epcTagged}/${epcTotal}, BPMN: ${bpmnTagged}/${bpmnTotal}`;
      if (!epcTotal || !bpmnTotal) return []; // нет одной из нотаций — связывать нечего
      // Словари считаются связанными, только если теги появились в обеих нотациях.
      if (epcTagged > 0 && bpmnTagged > 0) return [];
      return [
        finding('INFO', {
          text: `Словари событий EPC и BPMN не связаны: теги [A-номер] несут ${epcTagged}/${epcTotal} событий EPC и ${bpmnTagged}/${bpmnTotal} событий/шлюзов BPMN`,
          hint: 'Проставьте общие теги [A-номер] событиям-триггерам обеих нотаций — словари событий должны пересекаться.',
        }),
      ];
    },
    passDetail: (ctx) => ctx.ruleMetrics['CR-15'] ?? '—',
  },
  {
    id: 'CR-16',
    level: 'ERROR',
    category: 'D',
    title: 'Каждый BPMN-процесс имеет sequence-диаграмму',
    description:
      '«Каждое действие … породить набор UML-диаграмм»: у каждого BPMN-процесса должна быть sequence-диаграмма, теги линий жизни/сообщений которой пересекаются с тегами задач процесса. Задачи, раскрытые дочерним BPMN-процессом, представляют этот дочерний процесс и не учитываются.',
    run: (ctx) => {
      const seqTags = new Map<string, Set<string>>();
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'sequence') continue;
        const tags = new Set<string>();
        for (const box of diagram.boxes) {
          if (box.kind === 'lifeline' || box.kind === 'actorLine') for (const n of parseTags(box.name)) tags.add(n);
        }
        for (const arrow of diagram.arrows) for (const n of parseTags(arrow.label)) tags.add(n);
        seqTags.set(diagram.id, tags);
      }
      const out: Finding[] = [];
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'bpmn') continue;
        // Задачи без собственной декомпозиции — «прямые» шаги этого процесса.
        const ownTags = new Set<string>();
        let taskCount = 0;
        for (const box of diagram.boxes) {
          if (box.kind !== 'task' || box.child) continue;
          taskCount++;
          for (const n of parseTags(box.name)) ownTags.add(n);
        }
        if (!taskCount || !ownTags.size) continue;
        const covered = [...seqTags.values()].some((tags) => [...ownTags].some((t) => tags.has(t)));
        if (covered) continue;
        const firstTask = diagram.boxes.find((b) => b.kind === 'task');
        out.push(
          finding('ERROR', {
            text: `BPMN-процесс «${diagramTitle(ctx.model, diagram.id)}» (${diagram.id}) не имеет sequence-диаграммы: теги задач ${[...ownTags].join(', ')} не встречаются ни на одной sequence`,
            diagramId: diagram.id,
            boxId: firstTask?.id,
            hint: 'Добавьте sequence-диаграмму сценария взаимодействий и протегируйте её линии жизни/сообщения тегами задач процесса.',
          }),
        );
      }
      return out;
    },
  },

  // ---------------- Категория E. UML: роли и участники
  {
    id: 'CR-17',
    level: 'WARN',
    category: 'E',
    title: 'Внутренняя линия жизни sequence — роль оргструктуры',
    description:
      '«Участники = роли»: линия жизни, не являющаяся системой или внешним контрагентом, обязана быть ролью. Системная линия узнаётся по тегу [A-номер] функции; нечёткое совпадение с ролью — тоже нарушение (нужен алиас или переименование).',
    run: (ctx) => {
      const out: Finding[] = [];
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'sequence') continue;
        for (const box of diagram.boxes) {
          if (box.kind === 'lifeline') {
            const base = box.name.replace(/\[[^\]]*\]/g, '').trim();
            if (exactMatch(ctx, base, 'role') || exactMatch(ctx, box.name, 'role')) continue;
            const fuzzy = fuzzyMatch(ctx, base, 'role');
            if (fuzzy) {
              out.push(
                finding('WARN', {
                  text: `Линия жизни «${base}» (${diagram.id}) совпадает с ролью «${fuzzy.name}» лишь нечётко — алиас не задан`,
                  diagramId: diagram.id,
                  boxId: box.id,
                  hint: `Переименуйте линию жизни точно по роли или добавьте алиас «${base}» → «${fuzzy.name}».`,
                }),
              );
              continue;
            }
            if (parseTags(box.name).some((n) => ctx.byNum.has(n))) continue; // системная линия с тегом
            out.push(
              finding('WARN', {
                text: `Линия жизни «${base}» (${diagram.id}) не является ни ролью оргструктуры, ни системой с тегом [A-номер]`,
                diagramId: diagram.id,
                boxId: box.id,
                hint: 'Участники сценария — роли оргструктуры; для системных линий укажите тег [A-номер] поддерживаемой функции.',
              }),
            );
          }
          if (box.kind === 'actorLine') {
            const base = box.name.replace(/\[[^\]]*\]/g, '').trim();
            if (exactMatch(ctx, base, 'external') || exactMatch(ctx, box.name, 'external')) continue;
            const fuzzy = overlapMatch(ctx, base, 'external');
            out.push(
              finding('WARN', {
                text: fuzzy
                  ? `Внешний участник «${base}» (${diagram.id}) совпадает с внешней сущностью DFD «${fuzzy.name}» лишь нечётко`
                  : `Внешний участник «${base}» (${diagram.id}) не объявлен внешней сущностью DFD`,
                diagramId: diagram.id,
                boxId: box.id,
                hint: 'Внешний участник сценария должен совпадать с внешней сущностью на контекстной DFD.',
              }),
            );
          }
        }
      }
      return out;
    },
  },
  {
    id: 'CR-18',
    level: 'WARN',
    category: 'E',
    title: 'Актёр usecase — роль org или внешняя сущность DFD',
    description:
      'Внутренний актёр должен точно совпадать с ролью оргструктуры, внешний — с внешней сущностью DFD. Нечёткие совпадения (окончания, вложенность формулировок) требуют алиаса или переименования.',
    run: (ctx) => {
      const out: Finding[] = [];
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'usecase') continue;
        for (const box of diagram.boxes) {
          if (box.kind !== 'actor') continue;
          const name = box.name.trim();
          if (exactMatch(ctx, name, 'role')) continue;
          if (exactMatch(ctx, name, 'external')) continue;
          const role = fuzzyMatch(ctx, name, 'role');
          const external = overlapMatch(ctx, name, 'external');
          if (role) {
            out.push(
              finding('WARN', {
                text: `Актёр «${name}» совпадает с ролью «${role.name}» лишь нечётко — алиас не задан`,
                diagramId: diagram.id,
                boxId: box.id,
                hint: `Сведите имена точно («${name}» ↔ «${role.name}») или добавьте алиас.`,
              }),
            );
          } else if (external) {
            out.push(
              finding('WARN', {
                text: `Актёр «${name}» совпадает с внешней сущностью DFD «${external.name}» лишь нечётко`,
                diagramId: diagram.id,
                boxId: box.id,
                hint: 'Внешний актёр должен называться как внешняя сущность контекстной DFD.',
              }),
            );
          } else {
            out.push(
              finding('WARN', {
                text: `Актёр «${name}» не связан ни с ролью оргструктуры, ни с внешней сущностью DFD`,
                diagramId: diagram.id,
                boxId: box.id,
                hint: 'Актёр прецедентов — это роль org (внутренний) или внешняя сущность DFD (внешний).',
              }),
            );
          }
        }
      }
      return out;
    },
  },
  {
    id: 'CR-19',
    level: 'WARN',
    category: 'E',
    title: 'Классы орг-диаграммы = подразделения org',
    description: 'UML-класс диаграммы оргструктуры должен совпадать с подразделением org в обе стороны: одна оргструктура, а не две.',
    run: (ctx) => {
      const out: Finding[] = [];
      const classes: { name: string; diagramId: string; boxId: string }[] = [];
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'class') continue;
        for (const box of diagram.boxes) {
          if (box.kind === 'class' || box.kind === 'interface' || box.kind === 'enumeration') {
            classes.push({ name: box.name, diagramId: diagram.id, boxId: box.id });
          }
        }
      }
      if (!classes.length && !ctx.deps.length) return [];
      const depNames = new Set(ctx.deps.map((d) => normName(d.name)));
      for (const cls of classes) {
        if (depNames.has(normName(cls.name))) continue;
        out.push(
          finding('WARN', {
            text: `Класс «${cls.name.replace(/\n/g, ' ')}» (${cls.diagramId}) не соответствует ни одному подразделению org`,
            diagramId: cls.diagramId,
            boxId: cls.boxId,
            hint: 'Диаграмма классов оргструктуры должна зеркалить org.departments.',
          }),
        );
      }
      const clsNames = new Set(classes.map((c) => normName(c.name)));
      for (const dep of ctx.deps) {
        if (clsNames.has(normName(dep.name))) continue;
        out.push(
          finding('WARN', {
            text: `Подразделение «${dep.name}» не отражено классом на диаграмме оргструктуры`,
            hint: 'Добавьте класс с тем же названием или удалите подразделение из org.',
          }),
        );
      }
      return out;
    },
    passDetail: (ctx) => `${ctx.deps.length} подразделений синхронны с классами`,
  },
  {
    id: 'CR-20',
    level: 'INFO',
    category: 'E',
    title: 'Элементы deployment связаны с моделью',
    description: 'Компонент инфраструктуры что-то поддерживает: несёт тег [A-номер] функции или его имя точно совпадает с хранилищем DFD / сущностью ERD (через алиас).',
    run: (ctx) => {
      const out: Finding[] = [];
      const COMP_KINDS = new Set<NodeKind>(['deployNode', 'device', 'component', 'artifact']);
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'deployment') continue;
        for (const box of diagram.boxes) {
          if (!COMP_KINDS.has(box.kind)) continue;
          if (parseTags(box.name).length) continue;
          if (exactMatch(ctx, box.name, 'store') || exactMatch(ctx, box.name, 'entity')) continue;
          out.push(
            finding('INFO', {
              text: `Элемент deployment «${box.name.replace(/\n/g, ' ')}» (${diagram.id}) не связан с моделью: нет тега [A-номер] и точного совпадения с хранилищем/сущностью`,
              diagramId: diagram.id,
              boxId: box.id,
              hint: 'Протегируйте компонент функцией, которую он автоматизирует, или назовите по хранилищу/сущности.',
            }),
          );
        }
      }
      return out;
    },
  },

  // ---------------- Категория F. Оргструктура и ДИ/Положения
  {
    id: 'CR-21',
    level: 'ERROR',
    category: 'F',
    title: 'Полное двустороннее покрытие: роль ↔ листовая работа',
    description:
      'Каждая роль имеет непустые works с существующими id работ, и каждая листовая работа покрыта хотя бы одной ролью (расширение org.ts:orgIssues на листовые работы).',
    run: (ctx) => {
      const out: Finding[] = [];
      const covered = new Set<string>();
      for (const role of ctx.roles) {
        const works = (role.works ?? []).filter(Boolean);
        if (!works.length) {
          out.push(
            finding('ERROR', {
              text: `Роль «${role.name}» не привязана ни к одной работе модели`,
              hint: 'Роль без работ не нужна в ФОТ-модели: привяжите её к работам или удалите.',
            }),
          );
          continue;
        }
        for (const wid of works) {
          if (!ctx.works.has(wid)) {
            out.push(
              finding('ERROR', {
                text: `Роль «${role.name}» ссылается на несуществующую работу ${wid}`,
                hint: 'Удалите битую ссылку из role.works.',
              }),
            );
          } else {
            covered.add(wid);
          }
        }
      }
      for (const work of leafWorks(ctx)) {
        if (covered.has(work.id)) continue;
        out.push(
          finding('ERROR', {
            text: `Листовая работа ${work.num} «${work.name}» не покрыта ни одной ролью`,
            diagramId: work.diagramId,
            boxId: work.id,
            hint: 'Назначьте работе исполнителя в оргконструкторе (role.works).',
          }),
        );
      }
      return out;
    },
    passDetail: (ctx) => {
      const leaves = leafWorks(ctx);
      return `${leaves.length}/${leaves.length} листовых работ покрыты ролями; ${ctx.roles.filter((r) => (r.works ?? []).length).length}/${ctx.roles.length} ролей имеют работы`;
    },
  },
  {
    id: 'CR-22',
    level: 'ERROR',
    category: 'F',
    title: 'ДИ/Положения формализованы: шаблоны заполнены',
    description:
      '«Формализуется в ДИ/Положениях»: org.templates.polozhenie и org.templates.di должны быть заданы — каждая роль с грейдом получает ДИ, каждый отдел — Положение.',
    run: (ctx) => {
      const org = ctx.model.org;
      const polozhenie = (org?.templates?.polozhenie ?? '').trim();
      const di = (org?.templates?.di ?? '').trim();
      if (polozhenie && di) return [];
      const missing = [!polozhenie && 'Положение об отделе', !di && 'Должностная инструкция'].filter(Boolean).join(', ');
      return [
        finding('ERROR', {
          text: `Шаблоны оргдокументов не заполнены: ${missing}${org ? '' : ' (раздел org отсутствует)'}`,
          hint: 'Заполните org.templates в оргконструкторе — без шаблонов ДИ/Положения не формализуются.',
        }),
      ];
    },
  },
  {
    id: 'CR-23',
    level: 'INFO',
    category: 'F',
    title: 'Оргединицы EPC — подразделения или роли org',
    description: 'Оргединица на сцене EPC должна точно совпадать с подразделением или ролью оргструктуры (одна оргструктура, а не две).',
    run: (ctx) => {
      const out: Finding[] = [];
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'epc') continue;
        for (const box of diagram.boxes) {
          if (box.kind !== 'orgUnit') continue;
          if (exactMatch(ctx, box.name, 'dep') || exactMatch(ctx, box.name, 'role')) continue;
          const near = fuzzyMatch(ctx, box.name, 'dep') ?? fuzzyMatch(ctx, box.name, 'role');
          out.push(
            finding('INFO', {
              text: near
                ? `Оргединица EPC «${box.name.replace(/\n/g, ' ')}» не совпадает точно с org (ближайшее: «${near.name}»)`
                : `Оргединица EPC «${box.name.replace(/\n/g, ' ')}» не соответствует ни подразделению, ни роли org`,
              diagramId: diagram.id,
              boxId: box.id,
              hint: 'Сведите названия с оргструктурой или добавьте алиас.',
            }),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'CR-24',
    level: 'INFO',
    category: 'F',
    title: 'Внешняя сущность DFD представлена актёром usecase',
    description: 'Не всякая внешняя сущность обязана участвовать в прецедентах, но полезно видеть, какие контрагенты не попали в сценарии usecase.',
    run: (ctx) => {
      const out: Finding[] = [];
      for (const diagram of Object.values(ctx.model.diagrams)) {
        if (diagram.notation !== 'dfd') continue;
        for (const box of diagram.boxes) {
          if (box.kind !== 'external') continue;
          if (exactMatch(ctx, box.name, 'actor') || overlapMatch(ctx, box.name, 'actor')) continue;
          out.push(
            finding('INFO', {
              text: `Внешняя сущность «${box.name.replace(/\n/g, ' ')}» (${diagram.id}) не представлена актёром usecase`,
              diagramId: diagram.id,
              boxId: box.id,
              hint: 'Если контрагент участвует в сценариях — добавьте актёра с тем же именем.',
            }),
          );
        }
      }
      return out;
    },
  },

  // ---------------- Категория G. Готовность модели
  {
    id: 'CR-25',
    level: 'INFO',
    category: 'G',
    title: 'Готовность к публикации: статусы диаграмм',
    description:
      'Доля диаграмм в статусах publication/recommended — метрика готовности. Публикация требует 100% диаграмм вне working/draft. Если abc.show=true — дополнительно центры затрат и стоимости работ должны быть заполнены.',
    run: (ctx) => {
      const diagrams = Object.values(ctx.model.diagrams).filter((d) => d.boxes.length > 0);
      const ready = diagrams.filter((d) => d.status === 'publication' || d.status === 'recommended');
      const byStatus = new Map<string, number>();
      for (const d of diagrams) byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);
      const statusText = [...byStatus.entries()].map(([s, n]) => `${s}: ${n}`).join(', ');
      ctx.ruleMetrics['CR-25'] = `${ready.length}/${diagrams.length} готово (${statusText})`;
      const out: Finding[] = [];
      if (ready.length < diagrams.length) {
        out.push(
          finding('INFO', {
            text: `Готовность к публикации: ${ready.length} из ${diagrams.length} диаграмм в статусах publication/recommended (${statusText})`,
            hint: 'Переведите диаграммы в статус recommended/publication по мере готовности.',
          }),
        );
      }
      if (ctx.model.abc.show) {
        if (!ctx.model.abc.centers.length) {
          out.push(
            finding('INFO', {
              text: 'ABC включён (abc.show), но центры затрат не заданы',
              hint: 'Заполните центры затрат или отключите показ стоимости.',
            }),
          );
        }
      }
      return out;
    },
    passDetail: (ctx) => ctx.ruleMetrics['CR-25'] ?? '—',
  },
];

// ============================================================ Прогон

export interface AuditOptions {
  categories?: AuditCategory[];
  aliases?: AliasTable;
}

const CATEGORY_TITLES: Record<AuditCategory, string> = {
  A: 'A. Трассировка и идентификаторы',
  B: 'B. Функции → процессы',
  C: 'C. Данные: DFD ↔ IDEF0 ↔ ERD',
  D: 'D. События и логика процессов',
  E: 'E. UML: роли и участники',
  F: 'F. Оргструктура и ДИ/Положения',
  G: 'G. Готовность модели',
};

const LEVEL_ORDER: Record<AuditLevel, number> = { ERROR: 0, WARN: 1, INFO: 2 };

/** Полный прогон аудита: индексы → правила → сортировка → отчёт. */
export function runAudit(model: Model, opts: AuditOptions = {}): AuditReport {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const ctx = buildContext(model);
  const categories = opts.categories ? new Set(opts.categories) : null;

  const groups: AuditGroup[] = [];
  const findings: Finding[] = [];
  const waived: Finding[] = [];
  const passes: AuditReport['passes'] = [];

  for (const rule of RULES) {
    if (categories && !categories.has(rule.category)) continue;
    let ruleFindings: Finding[] = [];
    try {
      ruleFindings = rule.run(ctx).map((f) => ({ ...f, rule: rule.id, level: rule.level }));
    } catch (error) {
      // Правило не должно ронять аудит целиком: отмечаем и продолжаем.
      ruleFindings = [
        { rule: rule.id, level: rule.level, text: `Правило ${rule.id} завершилось ошибкой: ${error instanceof Error ? error.message : String(error)}` },
      ];
    }
    const ruleWaived: Finding[] = [];
    const ruleOpen: Finding[] = [];
    for (const f of ruleFindings) {
      if (boxWaived(model, f.diagramId, f.boxId, rule.id) || arrowWaived(model, f.diagramId, f.arrowId, rule.id)) ruleWaived.push(f);
      else ruleOpen.push(f);
    }
    findings.push(...ruleOpen);
    waived.push(...ruleWaived);

    if (!ruleOpen.length && !ruleWaived.length) {
      passes.push({ rule: rule.id, title: rule.title, detail: rule.passDetail?.(ctx) ?? 'нарушений нет' });
    }
  }

  findings.sort((a, b) =>
    LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
    a.rule.localeCompare(b.rule) ||
    a.text.localeCompare(b.text, 'ru'),
  );

  for (const key of ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as AuditCategory[]) {
    const outcomes = RULES.filter((r) => r.category === key && (!categories || categories.has(key))).map((rule) => {
      const ruleFindings = findings.filter((f) => f.rule === rule.id);
      const ruleWaived = waived.filter((f) => f.rule === rule.id);
      return {
        rule: rule.id,
        title: rule.title,
        level: rule.level,
        category: rule.category,
        description: rule.description,
        findings: ruleFindings,
        waived: ruleWaived,
        passDetail: rule.passDetail?.(ctx),
      };
    });
    groups.push({
      key,
      title: CATEGORY_TITLES[key],
      outcomes,
      error: outcomes.reduce((n, o) => n + o.findings.filter((f) => f.level === 'ERROR').length, 0),
      warn: outcomes.reduce((n, o) => n + o.findings.filter((f) => f.level === 'WARN').length, 0),
      info: outcomes.reduce((n, o) => n + o.findings.filter((f) => f.level === 'INFO').length, 0),
    });
  }

  // Матрица покрытия листовых работ.
  const rows: CoverageRow[] = leafWorks(ctx)
    .sort((a, b) => a.num.localeCompare(b.num, 'ru'))
    .map((w) => {
      const slots = ctx.coverage.get(w.num);
      const count = (k: keyof CoverageSlots) => (slots?.[k] ?? []).length;
      return {
        num: w.num,
        name: w.name,
        diagramId: w.diagramId,
        boxId: w.id,
        dfd: count('dfd'),
        bpmn: count('bpmn'),
        idef3: count('idef3'),
        epc: count('epc'),
        act: count('act'),
        uc: count('uc'),
        seq: count('seq'),
        org: count('org'),
      };
    });
  const coveredBy = (predicate: (row: CoverageRow) => boolean) => rows.filter(predicate).length;
  const coverage = {
    leafWorks: rows.length,
    byNotation: {
      bpmn: coveredBy((r) => r.bpmn > 0),
      idef3: coveredBy((r) => r.idef3 > 0),
      epc: coveredBy((r) => r.epc > 0),
      act: coveredBy((r) => r.act > 0),
      anyProcess: coveredBy((r) => r.bpmn + r.idef3 + r.epc + r.act > 0),
      dfd: coveredBy((r) => r.dfd > 0),
      uc: coveredBy((r) => r.uc > 0),
      org: coveredBy((r) => r.org > 0),
    },
    rows,
  };

  const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    summary: {
      error: findings.filter((f) => f.level === 'ERROR').length,
      warn: findings.filter((f) => f.level === 'WARN').length,
      info: findings.filter((f) => f.level === 'INFO').length,
      waived: waived.length,
    },
    findings,
    waived,
    passes,
    groups,
    coverage,
    durationMs: Math.round(ended - started),
  };
}
