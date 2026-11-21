import type { Box } from '../../../model/types';
import { INK, PAPER } from '../../../model/sheet';
import { BoxText, SMALL_TEXT } from '../text';
import type { ShapeSet } from './types';

// Подразделение/должность связаны с org через id: 'oc-<depId>' / 'oc-r-<roleId>'.
const orgOfBox = (model: import('../../../model/types').Model, box: Box) => {
  const org = model.org;
  if (!org || !box.id.startsWith('oc-')) return null;
  if (box.id.startsWith('oc-r-')) {
    const rid = box.id.slice(5);
    for (const dep of org.departments) {
      const role = dep.roles.find((r) => r.id === rid);
      if (role) return { dep, role };
    }
    return null;
  }
  const dep = org.departments.find((d) => d.id === box.id.slice(3));
  return dep ? { dep, role: null } : null;
};

const KIND_COLOR: Record<string, string> = {
  service: 'var(--icom-i)',
  development: 'var(--icom-o)',
  internal: 'var(--muted)',
};

export const orgShapes: ShapeSet = {
  orgBox: (box, context) => {
    const link = orgOfBox(context.model, box);
    const dep = link?.dep;
    const fte = dep ? dep.roles.reduce((s, r) => s + (r.fte || 0), 0) : null;
    const color = dep ? KIND_COLOR[dep.kind] ?? 'var(--muted)' : 'var(--muted)';
    const { x, y, w, h } = box;
    return (
      <>
        <rect x={x} y={y} width={w} height={h} rx={7} fill={PAPER} stroke={INK} strokeWidth={1.6} />
        <line x1={x} y1={y + 18} x2={x + w} y2={y + 18} stroke={INK} strokeWidth={1} />
        <line x1={x} y1={y} x2={x} y2={y + h} stroke={color} strokeWidth={4} />
        <text x={x + w - 6} y={y + 13} {...SMALL_TEXT} textAnchor="end" fill={color}>
          {fte !== null ? `${fte} ед.` : 'подразделение'}
        </text>
        {dep && (
          <text x={x + 8} y={y + 13} {...SMALL_TEXT} fill={color}>
            {dep.kind === 'service' ? 'обслуживание' : dep.kind === 'development' ? 'развитие' : 'обеспечение'}
          </text>
        )}
        <BoxText box={box} top={18} />
      </>
    );
  },

  orgRole: (box, context) => {
    const link = orgOfBox(context.model, box);
    const role = link?.role;
    const { x, y, w, h } = box;
    return (
      <>
        <rect x={x} y={y} width={w} height={h} rx={9} fill={PAPER} stroke={INK} strokeWidth={1.2} strokeDasharray={role ? undefined : '4 3'} />
        {role && (
          <text x={x + w - 6} y={y + 12} {...SMALL_TEXT} textAnchor="end" fill="var(--muted)">
            {role.grade} · {role.fte} FTE
          </text>
        )}
        <BoxText box={{ ...box, w: role ? w - 8 : w }} top={role ? 12 : 0} />
      </>
    );
  },
};
