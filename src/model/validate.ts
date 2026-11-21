import type { Arrow, Box, Diagram, Endpoint, Model, NodeKind, Notation } from './types';
import { boxNumber, diagramOrder, labelOf, nodeOf } from './query';
import { KINDS } from './notation';

export interface Issue {
  diagram: string;
  kind: 'box' | 'arrow' | 'diagram';
  id: string;
  text: string;
}

interface Check {
  model: Model;
  diagram: Diagram;
  node: string;
  report: (kind: Issue['kind'], id: string, text: string) => void;
}

const into = (diagram: Diagram, box: Box) => diagram.arrows.filter((a) => a.to.t === 'box' && a.to.box === box.id);
const outOf = (diagram: Diagram, box: Box) => diagram.arrows.filter((a) => a.from.t === 'box' && a.from.box === box.id);
const boxAt = (diagram: Diagram, end: Endpoint) => (end.t === 'box' ? diagram.boxes.find((b) => b.id === end.box) : undefined);

function works(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return `${count} работа`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} работы`;
  return `${count} работ`;
}

function title(box: Box) {
  const name = box.name.trim().split('\n')[0];
  return name ? `«${name}»` : KINDS[box.kind].title.toLowerCase();
}

function reportUnnamed({ diagram, node, report }: Check, kinds: NodeKind[], what: string) {
  for (const box of diagram.boxes) {
    if (kinds.includes(box.kind) && !box.name.trim()) report('box', box.id, `${node}: ${what} без названия`);
  }
}

function checkIdef0({ model, diagram, node, report }: Check) {
  const activities = diagram.boxes.filter((b) => b.kind === 'activity');
  if (diagram.parent && (activities.length < 3 || activities.length > 6)) {
    report('diagram', diagram.id, `${node}: на диаграмме ${works(activities.length)}, по стандарту — от 3 до 6`);
  }
  for (const box of activities) {
    const number = boxNumber(model, diagram.id, box.id);
    if (!box.name.trim()) report('box', box.id, `${number}: у работы нет названия`);
    if (!outOf(diagram, box).length) report('box', box.id, `${number}: нет ни одного выхода`);
    const hasControl = into(diagram, box).some((a) => a.to.t === 'box' && a.to.side === 'top');
    if (!hasControl) report('box', box.id, `${number}: нет ни одного управления`);
  }
}

function checkDfd({ model, diagram, node, report }: Check) {
  for (const box of diagram.boxes.filter((b) => b.kind !== 'text')) {
    const number = boxNumber(model, diagram.id, box.id) || box.name;
    if (!box.name.trim()) report('box', box.id, `${node}: у элемента ${number} нет названия`);
    if (box.kind === 'process') {
      if (!into(diagram, box).length) report('box', box.id, `${number}: у процесса нет входящих потоков`);
      if (!outOf(diagram, box).length) report('box', box.id, `${number}: у процесса нет исходящих потоков`);
    }
    if (box.kind === 'store' && !into(diagram, box).length && !outOf(diagram, box).length) {
      report('box', box.id, `${number}: хранилище ни с чем не связано`);
    }
  }

  const word = (box: Box) => (box.kind === 'store' ? 'хранилище' : 'сущность');
  for (const arrow of diagram.arrows) {
    const from = boxAt(diagram, arrow.from);
    const to = boxAt(diagram, arrow.to);
    if (from && to && from.kind !== 'process' && to.kind !== 'process') {
      const name = labelOf(model, arrow) || 'без названия';
      report('arrow', arrow.id, `${node}: поток «${name}» соединяет ${word(from)} и ${word(to)} напрямую — между ними должен быть процесс`);
    }
  }
}

function checkIdef3({ model, diagram, report }: Check) {
  for (const box of diagram.boxes) {
    const number = boxNumber(model, diagram.id, box.id) || box.name;
    if (box.kind === 'uow' && !box.name.trim()) report('box', box.id, `${number}: у работы нет названия`);
    if (box.kind !== 'junction') continue;
    const incoming = into(diagram, box).length;
    const outgoing = outOf(diagram, box).length;
    if (incoming < 1 || outgoing < 1) report('box', box.id, `${number}: у перекрёстка должны быть входящие и исходящие связи`);
    else if (incoming < 2 && outgoing < 2) report('box', box.id, `${number}: перекрёсток должен разветвлять или сводить связи`);
  }
}

function checkOrgChart({ model, diagram, node, report }: Check) {
  const orgBoxes = diagram.boxes.filter((b) => b.kind === 'orgBox');
  const roles = diagram.boxes.filter((b) => b.kind === 'orgRole');
  const managesInto = new Map<string, number>();
  for (const a of diagram.arrows) if (a.to.t === 'box' && a.link !== 'executes') managesInto.set(a.to.box, (managesInto.get(a.to.box) ?? 0) + 1);

  const roots = orgBoxes.filter((b) => !managesInto.has(b.id));
  if (roots.length > 1) {
    for (const b of roots.slice(1)) report('box', b.id, `${node}: у подразделения «${b.name.split('
)[0]}» нет вышестоящего — на диаграмме должно быть одно корневое подразделение`);
  }
  for (const b of roles) {
    const n = managesInto.get(b.id) ?? 0;
    if (n !== 1) report('box', b.id, `${node}: у должности «${b.name.split('
)[0]}» ${n === 0 ? 'нет вышестоящего' : `несколько вышестоящих (${n})`} — должна быть ровно одна линия подчинения`);
  }
  for (const b of orgBoxes) {
    const name = b.name.split('
)[0];
    if (model.org && b.id.startsWith('oc-') && !model.org.departments.some((d) => `oc-${d.id}` === b.id) && !b.id.startsWith('oc-r-')) {
      // блок-подразделение, которого больше нет в org (остался после удаления)
    }
    if (!name.trim()) report('box', b.id, `${node}: подразделение без названия`);
  }
  // циклы: проход по manages
  const next = new Map<string, string>();
  for (const a of diagram.arrows) {
    if (a.link === 'executes' || a.from.t !== 'box' || a.to.t !== 'box') continue;
    next.set(a.from.box, a.to.box);
  }
  for (const b of [...orgBoxes, ...roles]) {
    const seen = new Set<string>([b.id]);
    let cur: string | undefined = b.id;
    while (cur && next.has(cur)) {
      cur = next.get(cur);
      if (cur && seen.has(cur)) {
        report('box', b.id, `${node}: цикл подчинения через «${b.name.split('
)[0]}»`);
        break;
      }
      if (cur) seen.add(cur);
    }
  }
}

function checkBpmn({ diagram, node, report }: Check) {
  const isFlow = (a: Arrow) => (a.link ?? 'sequence') === 'sequence';
  const flowsIn = (b: Box) => into(diagram, b).filter(isFlow).length;
  const flowsOut = (b: Box) => outOf(diagram, b).filter(isFlow).length;
  const has = (kind: NodeKind) => diagram.boxes.some((b) => b.kind === kind);

  if (has('task') && !has('startEvent')) report('diagram', diagram.id, `${node}: в процессе нет начального события`);
  if (has('task') && !has('endEvent')) report('diagram', diagram.id, `${node}: в процессе нет конечного события`);

  for (const box of diagram.boxes) {
    if (box.kind === 'startEvent' && flowsIn(box)) report('box', box.id, `${node}: в начальное событие не должен входить поток управления`);
    if (box.kind === 'endEvent' && flowsOut(box)) report('box', box.id, `${node}: из конечного события не должен выходить поток управления`);
    if (box.kind === 'startEvent' && !flowsOut(box)) report('box', box.id, `${node}: из начального события ничего не выходит`);
    if (box.kind === 'endEvent' && !flowsIn(box)) report('box', box.id, `${node}: в конечное событие ничего не входит`);
    if (box.kind === 'task' || box.kind === 'intermediateEvent') {
      if (!flowsIn(box)) report('box', box.id, `${node}: ${title(box)} — нет входящего потока`);
      if (!flowsOut(box)) report('box', box.id, `${node}: ${title(box)} — нет исходящего потока`);
    }
    if (box.kind === 'gateway' && flowsIn(box) < 2 && flowsOut(box) < 2) report('box', box.id, `${node}: шлюз должен разветвлять или сводить потоки`);
  }
}

function checkEpcConnector({ diagram, node, report }: Check, connector: Box, incoming: Arrow[], outgoing: Arrow[]) {
  if (!incoming.length || !outgoing.length) {
    report('box', connector.id, `${node}: у оператора должны быть входящие и исходящие связи`);
  } else if (incoming.length < 2 && outgoing.length < 2) {
    report('box', connector.id, `${node}: оператор должен разветвлять или сводить цепочку`);
  }

  const source = incoming.length === 1 ? boxAt(diagram, incoming[0].from) : undefined;
  const splitsAfterEvent = outgoing.length > 1 && source?.kind === 'epcEvent';
  if (splitsAfterEvent && (connector.junction ?? 'xor') !== 'and') {
    report('box', connector.id, `${node}: после события ${title(source)} ветвление может быть только по «И» — событие не принимает решений`);
  }
}

function checkEpc(check: Check) {
  const { diagram, node, report } = check;
  const isFlow = (a: Arrow) => (a.link ?? 'control') === 'control';
  const flowsIn = (b: Box) => into(diagram, b).filter(isFlow);
  const flowsOut = (b: Box) => outOf(diagram, b).filter(isFlow);

  reportUnnamed(check, ['epcEvent'], 'событие');
  reportUnnamed(check, ['epcFunction'], 'функция');

  const events = diagram.boxes.filter((b) => b.kind === 'epcEvent');
  const hasFunctions = diagram.boxes.some((b) => b.kind === 'epcFunction');
  if (hasFunctions && !events.some((b) => !flowsIn(b).length)) report('diagram', diagram.id, `${node}: цепочка должна начинаться с события`);
  if (hasFunctions && !events.some((b) => !flowsOut(b).length)) report('diagram', diagram.id, `${node}: цепочка должна заканчиваться событием`);

  for (const arrow of diagram.arrows.filter(isFlow)) {
    const from = boxAt(diagram, arrow.from);
    const to = boxAt(diagram, arrow.to);
    if (!from || !to) continue;
    if (from.kind === 'epcFunction' && to.kind === 'epcFunction') {
      report('arrow', arrow.id, `${node}: функции ${title(from)} и ${title(to)} идут подряд — между ними нужно событие`);
    }
    if (from.kind === 'epcEvent' && to.kind === 'epcEvent') {
      report('arrow', arrow.id, `${node}: события ${title(from)} и ${title(to)} идут подряд — между ними нужна функция`);
    }
  }

  for (const box of diagram.boxes) {
    const incoming = flowsIn(box);
    const outgoing = flowsOut(box);
    if ((box.kind === 'epcEvent' || box.kind === 'epcFunction') && (incoming.length > 1 || outgoing.length > 1)) {
      report('box', box.id, `${node}: ${title(box)} — несколько связей с одной стороны, используйте логический оператор`);
    }
    if (box.kind === 'epcFunction') {
      if (!incoming.length) report('box', box.id, `${node}: у функции ${title(box)} нет события на входе`);
      if (!outgoing.length) report('box', box.id, `${node}: у функции ${title(box)} нет события на выходе`);
    }
    if (box.kind === 'epcConnector') checkEpcConnector(check, box, incoming, outgoing);
  }
}

function checkUseCase(check: Check) {
  const { diagram, node, report } = check;
  reportUnnamed(check, ['useCase'], 'прецедент');
  reportUnnamed(check, ['actor'], 'актёр');
  for (const box of diagram.boxes) {
    const isolated = !into(diagram, box).length && !outOf(diagram, box).length;
    if ((box.kind === 'actor' || box.kind === 'useCase') && isolated) report('box', box.id, `${node}: ${title(box)} ни с чем не связан`);
  }
}

function checkUniqueNames(check: Check, kinds: NodeKind[], what: string) {
  const { diagram, node, report } = check;
  reportUnnamed(check, kinds, what);
  const seen = new Set<string>();
  for (const box of diagram.boxes.filter((b) => kinds.includes(b.kind) && b.name.trim())) {
    const key = box.name.trim().toLowerCase();
    if (seen.has(key)) report('box', box.id, `${node}: ${title(box)} — такое имя уже есть на диаграмме`);
    seen.add(key);
  }
}

function checkClass(check: Check) {
  checkUniqueNames(check, ['class', 'interface', 'enumeration'], 'класс');
}

function checkErd(check: Check) {
  checkUniqueNames(check, ['entity'], 'сущность');
  for (const box of check.diagram.boxes) {
    if (box.kind === 'entity' && !(box.keys ?? '').trim()) check.report('box', box.id, `${check.node}: у сущности ${title(box)} нет первичного ключа`);
  }
}

function checkSequence(check: Check) {
  const { model, diagram, node, report } = check;
  reportUnnamed(check, ['lifeline', 'actorLine'], 'линия жизни');
  for (const arrow of diagram.arrows) {
    const isMessage = arrow.seqY !== undefined && arrow.link !== 'reply';
    if (isMessage && !labelOf(model, arrow).trim()) report('arrow', arrow.id, `${node}: у сообщения нет названия`);
  }
}

function checkActivity(check: Check) {
  const { model, diagram, node, report } = check;
  const has = (...kinds: NodeKind[]) => diagram.boxes.some((b) => kinds.includes(b.kind));
  reportUnnamed(check, ['action'], 'действие');
  if (has('action') && !has('initialNode')) report('diagram', diagram.id, `${node}: нет начального узла`);
  if (has('action') && !has('finalNode', 'flowFinal')) report('diagram', diagram.id, `${node}: нет конечного узла`);

  const isFlow = (a: Arrow) => a.link !== 'anchor';
  for (const box of diagram.boxes) {
    const incoming = into(diagram, box).filter(isFlow).length;
    const outgoing = outOf(diagram, box).filter(isFlow);

    if (box.kind === 'action') {
      if (!incoming) report('box', box.id, `${node}: в действие ${title(box)} ничего не входит`);
      if (!outgoing.length) report('box', box.id, `${node}: из действия ${title(box)} ничего не выходит`);
    }
    if (box.kind === 'initialNode' && incoming) report('box', box.id, `${node}: в начальный узел не должен входить поток`);
    if ((box.kind === 'finalNode' || box.kind === 'flowFinal') && outgoing.length) report('box', box.id, `${node}: из конечного узла не должен выходить поток`);
    if ((box.kind === 'decision' || box.kind === 'forkBar') && incoming < 2 && outgoing.length < 2) {
      report('box', box.id, `${node}: ${KINDS[box.kind].title.toLowerCase()} должно разветвлять или сводить потоки`);
    }
    if (box.kind === 'decision' && outgoing.length > 1) {
      for (const arrow of outgoing) {
        if (!labelOf(model, arrow).trim()) report('arrow', arrow.id, `${node}: у выхода из решения нет условия, например «[да]»`);
      }
    }
  }
}

function checkDeployment(check: Check) {
  reportUnnamed(check, ['deployNode', 'device', 'component', 'artifact'], 'элемент');
}

const CHECKS: Record<Notation, (check: Check) => void> = {
  idef0: checkIdef0,
  orgchart: checkOrgChart,
  dfd: checkDfd,
  idef3: checkIdef3,
  bpmn: checkBpmn,
  epc: checkEpc,
  usecase: checkUseCase,
  class: checkClass,
  sequence: checkSequence,
  activity: checkActivity,
  deployment: checkDeployment,
  erd: checkErd,
};

function checkArrows({ model, diagram, node, report }: Check) {
  const needsName = diagram.notation === 'idef0' || diagram.notation === 'dfd';
  for (const arrow of diagram.arrows) {
    const name = labelOf(model, arrow).trim();
    const display = name ? `«${name}»` : 'Стрелка без названия';
    if (needsName && !name) report('arrow', arrow.id, `${node}: у стрелки нет названия`);
    if (arrow.from.t === 'free' || arrow.to.t === 'free') report('arrow', arrow.id, `${node}: ${display} не подключена одним концом`);
    const isBoundary = arrow.from.t === 'border' || arrow.to.t === 'border';
    if (isBoundary && diagram.parent && !arrow.parent && !arrow.tunnel) {
      report('arrow', arrow.id, `${node}: ${display} — граничная, но не связана с родительской диаграммой`);
    }
  }
}

export function validate(model: Model): Issue[] {
  const issues: Issue[] = [];
  for (const diagramId of diagramOrder(model)) {
    const diagram = model.diagrams[diagramId];
    const check: Check = {
      model,
      diagram,
      node: nodeOf(model, diagramId),
      report: (kind, id, text) => issues.push({ diagram: diagramId, kind, id, text }),
    };
    CHECKS[diagram.notation](check);
    checkArrows(check);
  }
  return issues;
}
