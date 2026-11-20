import { useEffect, useState, type ReactNode } from 'react';
import { redo, setState, undo, useStore, type ThemePref } from '../store';
import { diagramOrder, diagramPath, diagramTitle, nodeOf } from '../model/query';
import { NOTATIONS, NOTATION_TABS } from '../model/notation';
import type { Model, Notation } from '../model/types';
import { exportPng, exportSvg, newFile, openDiagram, openFile, openRecentFile, printModel, save, switchNotation } from '../actions';
import { canvasApi } from './canvas/Canvas';
import { Icon, KindIcon } from './icons';
import { recentList } from '../platform';
import { canInstall, install, onInstallChange } from '../pwa';

const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_TIP: Record<ThemePref, string> = { system: 'Тема: как в системе', light: 'Тема: светлая', dark: 'Тема: тёмная' };
const THEME_ICON = { system: Icon.auto, light: Icon.sun, dark: Icon.moon };

export function fileName(path: string | null) {
  if (!path) return null;
  return path
    .split(/[\\/]/)
    .pop()!
    .replace(/\.(idef|json)$/i, '');
}

const filledDiagrams = (model: Model, notation: Notation) => diagramOrder(model, notation).filter((id) => model.diagrams[id].boxes.length).length;

function Count({ value }: { value: number }) {
  return value > 0 ? <i className="ntab-count">{value}</i> : null;
}

function Caret() {
  return (
    <svg className="ntab-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NotationButton({ notation, current, count }: { notation: Notation; current?: Notation; count: number }) {
  const on = current === notation;
  const info = NOTATIONS[notation];
  return (
    <button role="tab" aria-selected={on} className={'ntab' + (on ? ' on' : '')} onClick={() => switchNotation(notation)} title={info.title}>
      <b>{info.short}</b>
      {on && <span>{info.tab}</span>}
      <Count value={count} />
    </button>
  );
}

function NotationMenuItem({ notation, current, count, onPick }: { notation: Notation; current?: Notation; count: number; onPick: () => void }) {
  const info = NOTATIONS[notation];
  const choose = () => {
    onPick();
    switchNotation(notation);
  };
  return (
    <button role="menuitem" className={'ntab-item' + (current === notation ? ' on' : '')} onClick={choose}>
      <span className="ntab-item-icon">
        <KindIcon kind={info.kinds[0]} />
      </span>
      <span className="ntab-item-text">
        <b>
          {info.tab} <em>{info.short}</em>
        </b>
        <small>{info.description}</small>
      </span>
      <Count value={count} />
    </button>
  );
}

interface NotationGroupProps {
  title: string;
  items: Notation[];
  current?: Notation;
  countOf: (notation: Notation) => number;
  open: boolean;
  setOpen: (open: boolean) => void;
}

function NotationGroup({ title, items, current, countOf, open, setOpen }: NotationGroupProps) {
  const on = !!current && items.includes(current);
  const total = items.reduce((sum, n) => sum + countOf(n), 0);
  return (
    <div className="ntab-group">
      <button role="tab" aria-selected={on} aria-haspopup="menu" aria-expanded={open} className={'ntab' + (on ? ' on' : '')} onClick={() => setOpen(!open)} title="Диаграммы UML">
        <b>{title}</b>
        {on && <span>{NOTATIONS[current!].tab}</span>}
        <Count value={total} />
        <Caret />
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onPointerDown={() => setOpen(false)} />
          <div className="ntab-menu" role="menu">
            {items.map((n) => (
              <NotationMenuItem key={n} notation={n} current={current} count={countOf(n)} onPick={() => setOpen(false)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NotationTabs() {
  const { model, diagramId } = useStore();
  const current = model.diagrams[diagramId]?.notation;
  const [open, setOpen] = useState(false);
  const countOf = (notation: Notation) => filledDiagrams(model, notation);

  return (
    <div className="notation-tabs" role="tablist" aria-label="Тип диаграмм">
      {NOTATION_TABS.map((tab) =>
        typeof tab === 'string' ? (
          <NotationButton key={tab} notation={tab} current={current} count={countOf(tab)} />
        ) : (
          <NotationGroup key={tab.group} title={tab.title} items={tab.items} current={current} countOf={countOf} open={open} setOpen={setOpen} />
        ),
      )}
    </div>
  );
}

export function Crumbs() {
  const { model, diagramId } = useStore();
  return (
    <nav className="crumbs no-canvas" aria-label="Уровни модели" onPointerDown={(e) => e.stopPropagation()}>
      {diagramPath(model, diagramId).map((id, i) => (
        <span key={id} className="crumb-wrap">
          {i > 0 && <Icon.chevron />}
          <button className={'crumb' + (id === diagramId ? ' on' : '')} onClick={() => openDiagram(id)} title={diagramTitle(model, id)}>
            <b>{nodeOf(model, id)}</b>
            {id === diagramId && <span className="crumb-title">{diagramTitle(model, id)}</span>}
          </button>
        </span>
      ))}
    </nav>
  );
}

function Separated({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="menu-sep" />
      {children}
    </>
  );
}

function useRecentFiles(menuOpen: boolean) {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (menuOpen) recentList().then((list) => setRecent(list.map((file) => file.name)));
  }, [menuOpen]);
  return recent;
}

function useInstallable() {
  const [installable, setInstallable] = useState(canInstall());
  useEffect(() => onInstallChange(() => setInstallable(canInstall())), []);
  return installable;
}

interface FileMenuProps {
  idef0: boolean;
  recent: string[];
  installable: boolean;
  close: () => void;
}

function FileMenu({ idef0, recent, installable, close }: FileMenuProps) {
  const run = (action: () => void) => () => {
    close();
    action();
  };
  const item = (label: string, shortcut: string, action: () => void) => (
    <button className="menu-item" onClick={run(action)}>
      <span>{label}</span>
      <kbd>{shortcut}</kbd>
    </button>
  );

  return (
    <>
      <div className="menu-backdrop" onPointerDown={close} />
      <div className="menu" role="menu">
        {item('Новая модель…', 'Alt+N', newFile)}
        {item('Открыть…', 'Ctrl+O', openFile)}
        {item('Сохранить', 'Ctrl+S', () => save())}
        {item('Сохранить как…', 'Ctrl+Shift+S', () => save(true))}
        {recent.length > 0 && (
          <Separated>
            <div className="menu-label">Недавние</div>
            {recent.map((path) => (
              <button key={path} className="menu-item recent" title={path} onClick={run(() => openRecentFile(path))}>
                <span>{fileName(path)}</span>
              </button>
            ))}
          </Separated>
        )}
        <Separated>
          {item('Экспорт диаграммы в PNG', '', () => exportPng())}
          {item('Экспорт диаграммы в SVG', '', exportSvg)}
          {item('Печать или PDF: эта диаграмма', '', () => printModel(true))}
          {item('Печать или PDF: вся модель', 'Ctrl+P', () => printModel(false))}
        </Separated>
        {idef0 && (
          <Separated>
            {item('Стоимостной анализ (ABC)', '', () => setState({ dialog: { kind: 'abc' } }))}
            {item('Оргструктура и стоимость…', '', () => setState({ dialog: { kind: 'org' } }))}
          </Separated>
        )}
        <Separated>
          {item('Горячие клавиши', 'F1', () => setState({ dialog: { kind: 'shortcuts' } }))}
          {item('О программе', '', () => setState({ dialog: { kind: 'about' } }))}
        </Separated>
        {installable && (
          <Separated>
            <button className="menu-item install" onClick={run(install)}>
              <span>
                <Icon.install /> Установить как приложение
              </span>
            </button>
          </Separated>
        )}
      </div>
    </>
  );
}

export function TopBar() {
  const { model, diagramId, filePath, dirty, past, future, zoom, showGrid, showFrame, theme } = useStore();
  const [menu, setMenu] = useState(false);
  const recent = useRecentFiles(menu);
  const installable = useInstallable();
  const name = fileName(filePath) ?? model.meta.name ?? 'Без имени';
  const ThemeIcon = THEME_ICON[theme];

  return (
    <header className="topbar">
      <div className="tb-left">
        <button className={'tb-btn menu-btn' + (menu ? ' on' : '')} onClick={() => setMenu(!menu)} aria-haspopup="menu">
          <img className="brand-mark brand-light" src="./logo-mark-29.svg" alt="ИТ-Элемент [29]" />
          <img className="brand-mark brand-dark" src="./logo-mark-29-white.svg" alt="ИТ-Элемент [29]" />
          <span>Файл</span>
        </button>
        <div className="doc-name" title={filePath ?? 'Файл ещё не сохранён'}>
          <span className="doc-title">{name}</span>
          {dirty && <span className="dirty-dot" title="Есть несохранённые изменения" />}
        </div>
        <div className="tb-group">
          <button className="tb-icon" data-tip="Отменить  Ctrl+Z" disabled={!past.length} onClick={undo}>
            <Icon.undo />
          </button>
          <button className="tb-icon" data-tip="Повторить  Ctrl+Y" disabled={!future.length} onClick={redo}>
            <Icon.redo />
          </button>
        </div>
      </div>

      <NotationTabs />

      <div className="tb-right">
        <div className="tb-group">
          <button className="tb-icon" data-tip="Уменьшить  Ctrl+−" onClick={() => canvasApi.zoomBy(1 / 1.2)}>
            <Icon.minus />
          </button>
          <button className="zoom-val" data-tip="Вписать лист  Ctrl+0" onClick={() => canvasApi.fit()}>
            {Math.round(zoom * 100)}%
          </button>
          <button className="tb-icon" data-tip="Увеличить  Ctrl+=" onClick={() => canvasApi.zoomBy(1.2)}>
            <Icon.plus />
          </button>
        </div>
        <div className="tb-group">
          <button className={'tb-icon' + (showGrid ? ' on' : '')} data-tip="Сетка" onClick={() => setState({ showGrid: !showGrid })}>
            <Icon.grid />
          </button>
          <button className={'tb-icon' + (showFrame ? ' on' : '')} data-tip="Рамка листа" onClick={() => setState({ showFrame: !showFrame })}>
            <Icon.frame />
          </button>
          <button className="tb-icon" data-tip={THEME_TIP[theme]} onClick={() => setState({ theme: THEME_NEXT[theme] })}>
            <ThemeIcon />
          </button>
        </div>
      </div>

      {menu && (
        <FileMenu idef0={model.diagrams[diagramId]?.notation === 'idef0'} recent={recent} installable={installable} close={() => setMenu(false)} />
      )}
    </header>
  );
}
