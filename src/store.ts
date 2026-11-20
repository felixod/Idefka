import { useSyncExternalStore } from 'react';
import type { Model, NodeKind, Notation } from './model/types';
import { newModel, normalize } from './model/ops';
import { invalidateIndex } from './model/query';

export type Tool = 'select' | 'node' | 'arrow' | 'hand';
export type ThemePref = 'system' | 'light' | 'dark';

export interface Selection {
  boxes: string[];
  arrows: string[];
}

export interface Editing {
  kind: 'box' | 'arrow';
  id: string;
}

export type DialogState =
  | { kind: 'decompose'; boxId: string }
  | { kind: 'new' }
  | { kind: 'abc' }
  | { kind: 'org' }
  | { kind: 'unsaved'; resolve: (answer: 'save' | 'discard' | 'cancel') => void }
  | { kind: 'about' }
  | { kind: 'shortcuts' };

export interface State {
  model: Model;
  diagramId: string;
  lastDiagram: Partial<Record<Notation, string>>;
  sel: Selection;
  tool: Tool;
  nodeKind: NodeKind;
  editing: Editing | null;
  filePath: string | null;
  dirty: boolean;
  past: Model[];
  future: Model[];
  theme: ThemePref;
  showGrid: boolean;
  showFrame: boolean;
  explorerOpen: boolean;
  dialog: DialogState | null;
  toast: { text: string; id: number } | null;
  zoom: number;
}

type Prefs = Partial<Pick<State, 'theme' | 'showGrid' | 'showFrame' | 'explorerOpen'>>;

const PREFS_KEY = 'cloneapp:prefs';
const HISTORY_LIMIT = 300;
const COALESCE_MS = 1500;
const TOAST_MS = 3200;

const THEMES: ThemePref[] = ['system', 'light', 'dark'];

const prefs = loadPrefs();
const initialModel = newModel();
let savedModel: Model | null = initialModel;

let state: State = {
  model: initialModel,
  diagramId: initialModel.roots.idef0,
  lastDiagram: {},
  sel: { boxes: [], arrows: [] },
  tool: 'select',
  nodeKind: 'activity',
  editing: null,
  filePath: null,
  dirty: false,
  past: [],
  future: [],
  theme: prefs.theme ?? 'system',
  showGrid: prefs.showGrid ?? true,
  explorerOpen: prefs.explorerOpen ?? true,
  showFrame: prefs.showFrame ?? true,
  dialog: null,
  toast: null,
  zoom: 1,
};

const listeners = new Set<() => void>();

export const getState = () => state;

export function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  if ('theme' in patch || 'showGrid' in patch || 'showFrame' in patch || 'explorerOpen' in patch) savePrefs();
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}

let lastCoalesce: { key: string; time: number } | null = null;
let gestureStart: Model | null = null;

function changedModel(change: (model: Model) => unknown): Model | null {
  const next = structuredClone(state.model);
  invalidateIndex(next);
  if (change(next) === false) return null;
  normalize(next);
  next.meta.modified = new Date().toISOString();
  return next;
}

const withHistory = (model: Model) => [...state.past.slice(-HISTORY_LIMIT + 1), model];

// Правка применяется к копии модели, а прежняя модель уходит в историю — отсюда простые undo/redo.
// coalesceKey склеивает серию быстрых однотипных правок (ввод в поле, сдвиг клавишами) в один шаг отмены.
export function commit<T>(change: (model: Model) => T, coalesceKey?: string): T | undefined {
  let result: T | undefined;
  const next = changedModel((model) => (result = change(model)));
  if (!next) return undefined;

  const now = Date.now();
  const merge = coalesceKey && lastCoalesce?.key === coalesceKey && now - lastCoalesce.time < COALESCE_MS;
  lastCoalesce = coalesceKey ? { key: coalesceKey, time: now } : null;

  setState({
    model: next,
    past: merge ? state.past : withHistory(state.model),
    future: [],
    dirty: true,
    sel: pruneSelection(next, state.diagramId, state.sel),
  });
  return result;
}

export function beginGesture() {
  gestureStart = state.model;
}

export function live(change: (model: Model) => void | false) {
  const next = changedModel(change);
  if (next) setState({ model: next, dirty: true });
}

export function endGesture() {
  if (gestureStart && gestureStart !== state.model) setState({ past: withHistory(gestureStart), future: [] });
  gestureStart = null;
  lastCoalesce = null;
}

const currentNotation = (): Notation => state.model.diagrams[state.diagramId]?.notation ?? 'idef0';

function travelTo(model: Model, past: Model[], future: Model[]) {
  const diagramId = model.diagrams[state.diagramId] ? state.diagramId : model.roots[currentNotation()];
  setState({ model, past, future, dirty: model !== savedModel, diagramId, sel: pruneSelection(model, diagramId, state.sel), editing: null });
  lastCoalesce = null;
}

export function undo() {
  const previous = state.past[state.past.length - 1];
  if (previous) travelTo(previous, state.past.slice(0, -1), [state.model, ...state.future]);
}

export function redo() {
  const [next, ...rest] = state.future;
  if (next) travelTo(next, [...state.past, state.model], rest);
}

function pruneSelection(model: Model, diagramId: string, selection: Selection): Selection {
  const diagram = model.diagrams[diagramId];
  if (!diagram) return { boxes: [], arrows: [] };
  const boxIds = new Set(diagram.boxes.map((b) => b.id));
  const arrowIds = new Set(diagram.arrows.map((a) => a.id));
  const boxes = selection.boxes.filter((id) => boxIds.has(id));
  const arrows = selection.arrows.filter((id) => arrowIds.has(id));
  const unchanged = boxes.length === selection.boxes.length && arrows.length === selection.arrows.length;
  return unchanged ? selection : { boxes, arrows };
}

export function markSaved(model: Model, filePath: string) {
  savedModel = model;
  setState({ filePath, dirty: state.model !== model });
}

export function markUnsaved() {
  savedModel = null;
  setState({ dirty: true });
}

export function loadModel(model: Model, filePath: string | null, notation: Notation = 'idef0') {
  savedModel = model;
  setState({
    model,
    diagramId: model.roots[notation],
    lastDiagram: {},
    sel: { boxes: [], arrows: [] },
    filePath,
    dirty: false,
    past: [],
    future: [],
    editing: null,
    tool: 'select',
  });
}

export function select(selection: Partial<Selection>) {
  setState({ sel: { boxes: selection.boxes ?? [], arrows: selection.arrows ?? [] } });
}

let toastCounter = 0;

export function toast(text: string) {
  const id = ++toastCounter;
  setState({ toast: { text, id } });
  setTimeout(() => {
    if (state.toast?.id === id) setState({ toast: null });
  }, TOAST_MS);
}

function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (!saved || typeof saved !== 'object') return {};
    return {
      theme: THEMES.includes(saved.theme) ? saved.theme : undefined,
      showGrid: typeof saved.showGrid === 'boolean' ? saved.showGrid : undefined,
      showFrame: typeof saved.showFrame === 'boolean' ? saved.showFrame : undefined,
      explorerOpen: typeof saved.explorerOpen === 'boolean' ? saved.explorerOpen : undefined,
    };
  } catch {
    return {};
  }
}

function savePrefs() {
  const { theme, showGrid, showFrame, explorerOpen } = state;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ theme, showGrid, showFrame, explorerOpen }));
  } catch {
    return;
  }
}
