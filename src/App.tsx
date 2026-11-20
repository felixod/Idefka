import { useEffect } from 'react';
import { getState, setState, subscribe, useStore } from './store';
import { autosave, openContent, restoreAutosave } from './actions';
import { onLaunchFile } from './platform';
import { handleKeyDown } from './shortcuts';
import { Canvas } from './components/canvas/Canvas';
import { TopBar, fileName } from './components/TopBar';
import { Explorer } from './components/Explorer';
import { Icon } from './components/icons';
import { Inspector } from './components/inspector/Inspector';
import { StatusBar } from './components/StatusBar';
import { Dialogs, Toast } from './components/dialogs/Dialogs';

const AUTOSAVE_DELAY_MS = 1200;
const darkScheme = () => window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const pref = getState().theme;
  const dark = pref === 'dark' || (pref === 'system' && darkScheme().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const topbarColor = getComputedStyle(document.documentElement).getPropertyValue('--topbar').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', topbarColor || (dark ? '#191d23' : '#f6f7f9'));
}

function openLaunchedFileOrDraft() {
  let launched = false;
  onLaunchFile((file) => {
    launched = true;
    openContent(file.content, file.name);
  });
  setTimeout(() => {
    if (!launched) restoreAutosave();
  }, 0);
}

function autosaveOnChanges() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastModel = getState().model;
  return subscribe(() => {
    const { model } = getState();
    if (model === lastModel) return;
    lastModel = model;
    clearTimeout(timer);
    timer = setTimeout(autosave, AUTOSAVE_DELAY_MS);
  });
}

function warnBeforeLeaving(event: BeforeUnloadEvent) {
  autosave();
  if (getState().dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
}

export function App() {
  const state = useStore();
  const explorerOpen = state.explorerOpen;
  const inspectorOpen = state.inspectorOpen;

  useEffect(() => {
    const scheme = darkScheme();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', warnBeforeLeaving);
    scheme.addEventListener('change', applyTheme);
    openLaunchedFileOrDraft();
    const stopAutosave = autosaveOnChanges();
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', warnBeforeLeaving);
      scheme.removeEventListener('change', applyTheme);
      stopAutosave();
    };
  }, []);

  useEffect(applyTheme, [state.theme]);

  const title = `${fileName(state.filePath) ?? state.model.meta.name}${state.dirty ? ' •' : ''} — Idefka`;
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className="app">
      <TopBar />
      <div className={'workspace' + (explorerOpen ? '' : ' explorer-closed') + (inspectorOpen ? '' : ' inspector-closed')}>
        <Explorer />
        {!explorerOpen && (
          <button
            className="explorer-rail"
            title="Показать панель модели"
            onClick={() => setState({ explorerOpen: true })}
          >
            <Icon.chevron />
          </button>
        )}
        <Canvas />
        <Inspector />
        {!inspectorOpen && (
          <button
            className="inspector-rail"
            title="Показать панель свойств"
            onClick={() => setState({ inspectorOpen: true })}
          >
            <Icon.chevron />
          </button>
        )}
      </div>
      <StatusBar />
      <Dialogs />
      <Toast />
    </div>
  );
}
