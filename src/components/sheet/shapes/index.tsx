import type { Box, Diagram, Model } from '../../../model/types';
import { headHeight } from '../../../model/compartments';
import { lifelineHead } from '../../../model/notation';
import { idefShapes } from './idef';
import { bpmnShapes } from './bpmn';
import { epcShapes } from './epc';
import { umlShapes } from './uml';
import { orgShapes } from './orgchart';
import type { ShapeSet } from './types';

const SHAPES: ShapeSet = { ...idefShapes, ...bpmnShapes, ...epcShapes, ...umlShapes, ...orgShapes };

export function BoxShape({ model, diagram, box, interactive }: { model: Model; diagram: Diagram; box: Box; interactive: boolean }) {
  const draw = SHAPES[box.kind] ?? SHAPES.activity!;
  return (
    <g data-k={interactive ? 'box' : undefined} data-id={interactive ? box.id : undefined}>
      {draw(box, { model, diagram })}
    </g>
  );
}

export interface NameRect {
  x: number;
  y: number;
  w: number;
  h: number;
  align: 'center' | 'left';
  size: number;
}

export function nameRect(box: Box): NameRect | null {
  const { x, y, w, h } = box;
  switch (box.kind) {
    case 'class':
    case 'interface':
    case 'enumeration':
    case 'entity':
      return { x, y: y + headHeight(box) - 24, w, h: 24, align: 'center', size: 13 };
    case 'lifeline':
      return { x, y, w, h: lifelineHead(box.kind), align: 'center', size: 12.5 };
    case 'actorLine':
      return { x: x - 30, y: y + 48, w: w + 60, h: 22, align: 'center', size: 11.5 };
    case 'systemBoundary':
    case 'partition':
      return { x, y, w, h: 30, align: 'center', size: 13 };
    case 'fragment':
      return { x: x + 50, y, w: Math.max(160, w - 60), h: 22, align: 'left', size: 11.5 };
    case 'deployNode':
    case 'device':
      return { x, y: y + 12, w: w - 12, h: 44, align: 'left', size: 12.5 };
    case 'umlNote':
      return { x, y, w, h, align: 'left', size: 11.5 };
    case 'orgBox':
      return { x: x + 6, y: y + 18, w: w - 12, h: h - 20, align: 'center', size: 12 };
    case 'orgRole':
      return { x: x + 6, y: y + 12, w: w - 12, h: h - 14, align: 'center', size: 11.5 };
    default:
      return null;
  }
}
