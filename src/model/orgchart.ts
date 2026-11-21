// Генерация диаграммы орг-структуры (нота orgchart) из раздела org модели.
// Идентификаторы стабильны: 'oc-<depId>' / 'oc-r-<roleId>' — при регенерации
// сохраняются позиции существующих блоков (ручная раскладка не теряется).
import type { Model, Diagram, Box, Arrow } from './types';
import { orgOf } from './org';

const W_DEP = 200;
const H_DEP = 64;
const W_ROLE = 176;
const H_ROLE = 48;

const snap = (v: number) => Math.round(v / 8) * 8;

interface Placed {
  dep: string; // depId
  depth: number;
  x: number;
  y: number;
}

/** Тiers-раскладка: уровни иерархии сверху вниз, отделы уровня — в колонку слева направо с запасом под роли. */
function layout(org: NonNullable<ReturnType<typeof orgOf>>) {
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const dep of org.departments) {
    if (dep.parentId && org.departments.some((d) => d.id === dep.parentId)) {
      const list = children.get(dep.parentId!) ?? [];
      list.push(dep.id);
      children.set(dep.parentId!, list);
    } else {
      roots.push(dep.id);
    }
  }
  const depthOf = new Map<string, number>();
  const visit = (id: string, depth: number) => {
    depthOf.set(id, depth);
    for (const ch of children.get(id) ?? []) visit(ch, depth + 1);
  };
  roots.forEach((r) => visit(r, 0));

  const placed: Placed[] = [];
  const byDepth = new Map<number, string[]>();
  for (const [id, d] of depthOf) {
    const list = byDepth.get(d) ?? [];
    list.push(id);
    byDepth.set(d, list);
  }
  const rowY = new Map<number, number>();
  for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
    const ids = byDepth.get(depth)!;
    const maxRoles = Math.max(1, ...ids.map((id) => (org.departments.find((d) => d.id === id)?.roles.length ?? 0)));
    rowY.set(depth, depth === 0 ? 64 : (rowY.get(depth - 1) ?? 64) + 96 + Math.min(4, maxRoles) * (H_ROLE + 8));
    ids.forEach((id, i) => placed.push({ dep: id, depth, x: snap(32 + i * (W_DEP + 24 + 40)), y: snap(rowY.get(depth)!) }));
  }
  return { placed, children, depthOf };
}

export function buildOrgChart(model: Model): Diagram {
  const org = orgOf(model);
  const boxes: Box[] = [];
  const arrows: Arrow[] = [];

  if (!org) {
    return { id: 'orgchart-main', notation: 'orgchart', status: 'working', boxes, arrows };
  }

  const { placed } = layout(org);
  const depById = new Map(org.departments.map((d) => [d.id, d]));

  const existing = model.diagrams['orgchart-main'];
  const prevPos = new Map<string, { x: number; y: number }>();
  if (existing) {
    for (const b of existing.boxes) if (!b.id.startsWith('oc-r-')) prevPos.set(b.id, { x: b.x, y: b.y });
  }

  const posOf = new Map<string, { x: number; y: number }>();
  for (const p of placed) {
    const id = `oc-${p.dep}`;
    const pos = prevPos.get(id) ?? { x: p.x, y: p.y };
    posOf.set(p.dep, pos);
    const dep = depById.get(p.dep)!;
    boxes.push({ id, kind: 'orgBox', name: dep.name, note: dep.mission, x: snap(pos.x), y: snap(pos.y), w: W_DEP, h: H_DEP });
  }

  // роли — колонкой под своим подразделением
  const roleAnchor = new Map<string, { x: number; y: number }>();
  for (const p of placed) {
    const dep = depById.get(p.dep)!;
    const pos = posOf.get(p.dep)!;
    dep.roles.forEach((role, i) => {
      if (i >= 4) return; // на диаграмме — первые 4 роли, остальные в свойствах/отчётах
      const rid = `oc-r-${role.id}`;
      const rx = snap(pos.x + 8);
      const ry = snap(pos.y + H_DEP + 10 + i * (H_ROLE + 8));
      boxes.push({ id: rid, kind: 'orgRole', name: role.name, note: (role.works ?? []).join(' '), x: rx, y: ry, w: W_ROLE, h: H_ROLE });
      roleAnchor.set(role.id, { x: rx, y: ry });
      arrows.push({
        id: `oa-${role.id}`,
        label: '',
        note: '',
        from: { t: 'box', box: rid, side: 'top' },
        to: { t: 'box', box: `oc-${p.dep}`, side: 'bottom' },
        link: 'manages',
      });
    });
  }

  // подчинённость подразделений
  for (const p of placed) {
    const dep = depById.get(p.dep)!;
    if (!dep.parentId || !posOf.has(dep.parentId)) continue;
    arrows.push({
      id: `oa-d-${p.dep}`,
      label: '',
      note: '',
      from: { t: 'box', box: `oc-${p.dep}`, side: 'top' },
      to: { t: 'box', box: `oc-${dep.parentId}`, side: 'bottom' },
      link: 'manages',
    });
  }

  return { id: 'orgchart-main', notation: 'orgchart', status: 'working', boxes, arrows };
}
