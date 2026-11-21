import { buildOrgChart } from '../model/orgchart';
import { commit, getState, select, setState, toast } from '../store';
import type { Notation } from '../model/types';
import { decompose, deleteItems } from '../model/ops';
import { KINDS, NOTATIONS } from '../model/notation';

export function openDiagram(id: string, selectBox?: string) {
  const state = getState();
  const diagram = state.model.diagrams[id];
  if (!diagram) return;
  const kinds = NOTATIONS[diagram.notation].kinds;
  setState({
    diagramId: id,
    lastDiagram: { ...state.lastDiagram, [diagram.notation]: id },
    sel: { boxes: selectBox ? [selectBox] : [], arrows: [] },
    editing: null,
    nodeKind: kinds.includes(state.nodeKind) ? state.nodeKind : kinds[0],
    tool: state.tool === 'node' ? 'select' : state.tool,
  });
}

export function switchNotation(notation: Notation) {
  const { lastDiagram, model } = getState();
  const last = lastDiagram[notation];
  openDiagram(last && model.diagrams[last] ? last : model.roots[notation]);
}

export function goUp() {
  const { model, diagramId } = getState();
  const parent = model.diagrams[diagramId]?.parent;
  if (parent) openDiagram(parent.diagram, parent.box);
}

export function decomposeSelected(boxId?: string) {
  const { model, diagramId, sel } = getState();
  const id = boxId ?? sel.boxes[0];
  const box = model.diagrams[diagramId].boxes.find((b) => b.id === id);
  if (!box) return toast('Выберите работу, которую нужно декомпозировать.');
  if (box.child) return openDiagram(box.child);
  if (!KINDS[box.kind].decomposable) return toast(`${KINDS[box.kind].title} не декомпозируется.`);
  setState({ dialog: { kind: 'decompose', boxId: box.id } });
}

export function doDecompose(boxId: string, count: number) {
  const { diagramId } = getState();
  const child = commit((model) => decompose(model, diagramId, boxId, count));
  setState({ dialog: null });
  if (child) openDiagram(child);
}

export function deleteSelection() {
  const { diagramId, sel } = getState();
  if (!sel.boxes.length && !sel.arrows.length) return;
  const warning = commit((model) => deleteItems(model, diagramId, sel.boxes, sel.arrows));
  select({});
  if (warning) toast(warning);
}

// Сгенерировать/обновить диаграмму орг-структуры из раздела org и открыть её.
export function regenerateOrgChart() {
  const id = 'orgchart-main';
  commit((draft) => {
    const chart = buildOrgChart(draft);
    draft.diagrams[id] = chart;
    draft.roots.orgchart = id;
  });
  openDiagram(id);
}
