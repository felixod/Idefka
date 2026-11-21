import type { Arrow, Box, Card, Diagram, Endpoint, LinkKind, Notation, NodeKind } from './types';
import type { Choice } from './notation';

export const LINKS: Partial<Record<Notation, Choice<LinkKind>[]>> = {
  idef3: [
    { value: 'precedence', label: 'Предшествование' },
    { value: 'relation', label: 'Отношение' },
    { value: 'object', label: 'Поток объектов' },
  ],
  bpmn: [
    { value: 'sequence', label: 'Поток управления' },
    { value: 'message', label: 'Сообщение' },
    { value: 'association', label: 'Ассоциация' },
  ],
  epc: [
    { value: 'control', label: 'Поток управления' },
    { value: 'info', label: 'Информационный поток' },
    { value: 'assign', label: 'Связь с исполнителем' },
  ],
  usecase: [
    { value: 'assoc', label: 'Ассоциация' },
    { value: 'include', label: '«include»' },
    { value: 'extend', label: '«extend»' },
    { value: 'generalization', label: 'Обобщение' },
    { value: 'anchor', label: 'К примечанию' },
  ],
  class: [
    { value: 'assoc', label: 'Ассоциация' },
    { value: 'directed', label: 'Направленная' },
    { value: 'aggregation', label: 'Агрегация' },
    { value: 'composition', label: 'Композиция' },
    { value: 'generalization', label: 'Наследование' },
    { value: 'realization', label: 'Реализация' },
    { value: 'dependency', label: 'Зависимость' },
    { value: 'anchor', label: 'К примечанию' },
  ],
  sequence: [
    { value: 'sync', label: 'Синхронное' },
    { value: 'async', label: 'Асинхронное' },
    { value: 'reply', label: 'Ответ' },
  ],
  activity: [
    { value: 'flow', label: 'Поток управления' },
    { value: 'anchor', label: 'К примечанию' },
  ],
  deployment: [
    { value: 'assoc', label: 'Канал связи' },
    { value: 'dependency', label: 'Зависимость' },
    { value: 'deploy', label: '«deploy»' },
    { value: 'anchor', label: 'К примечанию' },
  ],
  erd: [
    { value: 'identifying', label: 'Идентифицирующая' },
    { value: 'nonIdentifying', label: 'Неидентифицирующая' },
  ],
  orgchart: [
    { value: 'manages', label: 'Подчинение' },
    { value: 'executes', label: 'Исполняет работу [A…]' },
    { value: 'anchor', label: 'К примечанию' },
  ],
};

function kindAt(diagram: Diagram, end: Endpoint): NodeKind | undefined {
  if (end.t !== 'box') return undefined;
  return diagram.boxes.find((b) => b.id === end.box)?.kind;
}

const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x && inner.x + inner.w <= outer.x + outer.w && inner.y >= outer.y && inner.y + inner.h <= outer.y + outer.h;

function poolOf(diagram: Diagram, end: Endpoint): string | undefined {
  if (end.t !== 'box') return undefined;
  const box = diagram.boxes.find((b) => b.id === end.box);
  if (!box) return undefined;
  return diagram.boxes.find((p) => p.kind === 'pool' && contains(p, box))?.id;
}

export function defaultLink(diagram: Diagram, arrow: Arrow): LinkKind | undefined {
  const from = kindAt(diagram, arrow.from);
  const to = kindAt(diagram, arrow.to);
  const touches = (...kinds: NodeKind[]) => kinds.some((k) => k === from || k === to);
  const toNote = touches('umlNote');

  switch (diagram.notation) {
    case 'idef3':
      return 'precedence';
    case 'bpmn': {
      if (touches('annotation', 'dataObject', 'dataStore')) return 'association';
      const fromPool = poolOf(diagram, arrow.from);
      const toPool = poolOf(diagram, arrow.to);
      return fromPool && toPool && fromPool !== toPool ? 'message' : 'sequence';
    }
    case 'epc':
      if (touches('orgUnit')) return 'assign';
      if (touches('infoObject', 'epcDocument', 'appSystem')) return 'info';
      return 'control';
    case 'usecase':
      if (toNote) return 'anchor';
      if (from === 'useCase' && to === 'useCase') return 'include';
      if (from === 'actor' && to === 'actor') return 'generalization';
      return 'assoc';
    case 'class':
      if (toNote) return 'anchor';
      if (to === 'interface' && from !== 'interface') return 'realization';
      return 'assoc';
    case 'sequence':
      return toNote ? 'anchor' : 'sync';
    case 'activity':
      return toNote ? 'anchor' : 'flow';
    case 'deployment':
      if (toNote) return 'anchor';
      if (from === 'artifact' && (to === 'deployNode' || to === 'device')) return 'deploy';
      if (touches('artifact', 'component')) return 'dependency';
      return 'assoc';
    case 'erd':
      return 'identifying';
    default:
      return undefined;
  }
}

export type HeadKind = 'filled' | 'open' | 'lines' | 'hollow' | 'none';
export type TailKind = 'none' | 'diamond' | 'filledDiamond' | 'circle';

export interface LinkStyle {
  dash?: string;
  head: HeadKind;
  tail: TailKind;
  stereotype?: string;
  crow?: boolean;
}

const DASHED = '6 4';

export function linkStyle(link: LinkKind | undefined): LinkStyle {
  switch (link) {
    case 'relation':
      return { dash: DASHED, head: 'filled', tail: 'none' };
    case 'message':
      return { dash: '7 4', head: 'open', tail: 'circle' };
    case 'association':
      return { dash: '2 3', head: 'lines', tail: 'none' };
    case 'control':
      return { dash: '5 4', head: 'filled', tail: 'none' };
    case 'assign':
    case 'assoc':
      return { head: 'none', tail: 'none' };
    case 'directed':
    case 'flow':
    case 'async':
      return { head: 'lines', tail: 'none' };
    case 'include':
      return { dash: DASHED, head: 'lines', tail: 'none', stereotype: '«include»' };
    case 'extend':
      return { dash: DASHED, head: 'lines', tail: 'none', stereotype: '«extend»' };
    case 'deploy':
      return { dash: DASHED, head: 'lines', tail: 'none', stereotype: '«deploy»' };
    case 'dependency':
    case 'reply':
      return { dash: DASHED, head: 'lines', tail: 'none' };
    case 'generalization':
      return { head: 'hollow', tail: 'none' };
    case 'realization':
      return { dash: DASHED, head: 'hollow', tail: 'none' };
    case 'aggregation':
      return { head: 'none', tail: 'diamond' };
    case 'composition':
      return { head: 'none', tail: 'filledDiamond' };
    case 'anchor':
      return { dash: '3 3', head: 'none', tail: 'none' };
    case 'identifying':
      return { head: 'none', tail: 'none', crow: true };
    case 'nonIdentifying':
      return { dash: DASHED, head: 'none', tail: 'none', crow: true };
    default:
      return { head: 'filled', tail: 'none' };
  }
}

export const canBranch = (n: Notation) => n === 'idef0' || n === 'dfd' || n === 'idef3' || n === 'bpmn';

export const CARDS: Choice<Card>[] = [
  { value: '1', label: 'Ровно один' },
  { value: '01', label: 'Ноль или один' },
  { value: '1n', label: 'Один или много' },
  { value: '0n', label: 'Ноль или много' },
];
