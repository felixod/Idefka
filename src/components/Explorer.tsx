import { useState } from 'react';
import { select, setState, useStore, type Selection } from '../store';
import type { Arrow, Box, Diagram, Model, NodeKind } from '../model/types';
import { arrowRole, boxNumber, labelOf, rootOf, ROLE_NAME } from '../model/query';
import { openDiagram } from '../actions';
import { Icon, KindIcon } from './icons';
import { KINDS, NOTATIONS } from '../model/notation';

type Tab = 'tree' | 'arrows';

const WORK_KINDS = new Set<NodeKind>(['activity', 'process', 'uow', 'task']);
const ICOM_GROUPS = ['I', 'C', 'O', 'M'] as const;

function displayName(box: Box) {
  if (box.kind === 'junction') return 'Перекрёсток';
  return box.name.trim() || (WORK_KINDS.has(box.kind) ? 'Без названия' : KINDS[box.kind].title);
}

const listed = (diagram: Diagram | undefined) => diagram?.boxes.filter((b) => b.kind !== 'text') ?? [];

interface TreeRowProps {
  model: Model;
  diagramId: string;
  box: Box;
  depth: number;
  currentId: string;
  sel: Selection;
  collapsed: Set<string>;
  toggle: (id: string) => void;
}

function TreeRow(props: TreeRowProps) {
  const { model, diagramId, box, depth, currentId, sel, collapsed, toggle } = props;
  const child = box.child;
  const open = !!child && !collapsed.has(box.id);
  const here = child === currentId;
  const selected = diagramId === currentId && sel.boxes.includes(box.id);
  const title = child ? `Двойной щелчок — открыть декомпозицию (${NOTATIONS[model.diagrams[child]?.notation ?? 'idef0'].short})` : KINDS[box.kind].title;

  return (
    <div>
      <div
        className={'tree-row' + (here ? ' here' : '') + (selected ? ' sel' : '')}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => openDiagram(diagramId, box.id)}
        onDoubleClick={() => child && openDiagram(child)}
        title={title}
      >
        <button
          className={'twisty' + (child ? '' : ' empty') + (open ? ' open' : '')}
          onClick={(e) => {
            e.stopPropagation();
            if (child) toggle(box.id);
          }}
          tabIndex={-1}
        >
          {child && <Icon.chevron />}
        </button>
        <span className="tree-kind">
          <KindIcon kind={box.kind} />
        </span>
        <span className="tree-num">{boxNumber(model, diagramId, box.id)}</span>
        <span className="tree-name">{displayName(box)}</span>
      </div>
      {open && model.diagrams[child] && listed(model.diagrams[child]).map((c) => <TreeRow key={c.id} {...props} diagramId={child} box={c} depth={depth + 1} />)}
    </div>
  );
}

function ArrowRow({ model, arrow, selected }: { model: Model; arrow: Arrow; selected: boolean }) {
  const label = labelOf(model, arrow);
  const branch = arrow.from.t === 'tap' || arrow.to.t === 'tap';
  const dangling = arrow.from.t === 'free' || arrow.to.t === 'free';
  return (
    <div className={'tree-row' + (selected ? ' sel' : '')} onClick={() => select({ arrows: [arrow.id] })}>
      <span className={'tree-name' + (label ? '' : ' muted')}>{label || 'Без названия'}</span>
      {branch && <span className="badge">{arrow.from.t === 'tap' ? 'ветвь' : 'слияние'}</span>}
      {dangling && <span className="badge warn">не подключена</span>}
    </div>
  );
}

function ArrowList({ model, diagram, sel }: { model: Model; diagram: Diagram; sel: Selection }) {
  const groups =
    diagram.notation === 'idef0'
      ? ICOM_GROUPS.map((role) => ({ role, title: ROLE_NAME[role] as string | null, arrows: diagram.arrows.filter((a) => arrowRole(a) === role) }))
      : [{ role: '*', title: null, arrows: diagram.arrows }];

  return (
    <div className="arrow-list">
      {diagram.arrows.length === 0 && <p className="empty-note">На этой диаграмме пока нет стрелок.</p>}
      {groups
        .filter((group) => group.arrows.length)
        .map((group) => (
          <div key={group.role} className="arrow-group">
            {group.title && (
              <div className="group-title">
                <i className={'role-dot r-' + group.role} />
                {group.title}
              </div>
            )}
            {group.arrows.map((a) => (
              <ArrowRow key={a.id} model={model} arrow={a} selected={sel.arrows.includes(a.id)} />
            ))}
          </div>
        ))}
    </div>
  );
}

export function Explorer() {
  const { model, diagramId, sel } = useStore();
  const [tab, setTab] = useState<Tab>('tree');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const root = model.diagrams[rootOf(model, diagramId)];
  const diagram = model.diagrams[diagramId];
  const topLevel = listed(root);

  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  };

  return (
    <aside className="panel explorer">
      <div className="tabs">
        <button className={tab === 'tree' ? 'on' : ''} onClick={() => setTab('tree')}>
          Модель
        </button>
        <button className={tab === 'arrows' ? 'on' : ''} onClick={() => setTab('arrows')}>
          Стрелки <span className="count">{diagram.arrows.length}</span>
        </button>
        <button
          className="tab-collapse"
          title="Свернуть панель"
          onClick={() => setState({ explorerOpen: false })}
        >
          <Icon.chevron />
        </button>
      </div>
      <div className="panel-scroll">
        {tab === 'tree' && (
          <div className="tree">
            {topLevel.map((b) => (
              <TreeRow key={b.id} model={model} diagramId={root.id} box={b} depth={0} currentId={diagramId} sel={sel} collapsed={collapsed} toggle={toggle} />
            ))}
            {topLevel.length === 0 && <p className="empty-note">Здесь пока пусто. Выберите элемент на панели слева от листа и щёлкните по листу.</p>}
          </div>
        )}
        {tab === 'arrows' && <ArrowList model={model} diagram={diagram} sel={sel} />}
      </div>
    </aside>
  );
}
