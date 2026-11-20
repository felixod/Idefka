import { commit, setState, useStore, type ThemePref } from '../../store';
import { DEFAULT_TEMPLATES, orgOf } from '../../model/org';
import { DocExport } from './DocExport';

const THEMES: Array<{ id: ThemePref; label: string }> = [
  { id: 'system', label: 'Как в системе' },
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' },
];

export function SettingsDialog({ close }: { close: () => void }) {
  const { model, theme, showGrid, showFrame } = useStore();
  const org = orgOf(model);

  return (
    <div className="abc-dialog">
      <h2>Настройки</h2>

      <section style={{ marginBottom: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>
          Интерфейс
        </div>
        <div className="field-label" style={{ marginBottom: 4 }}>Тема</div>
        {THEMES.map((t) => (
          <button
            key={t.id}
            className="btn"
            style={theme === t.id ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
            onClick={() => setState({ theme: t.id })}
          >
            {theme === t.id ? '● ' : '○ '}{t.label}
          </button>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn" onClick={() => setState({ showGrid: !showGrid })}>
            {showGrid ? '● ' : '○ '}Сетка листа
          </button>
          <button className="btn" onClick={() => setState({ showFrame: !showFrame })}>
            {showFrame ? '● ' : '○ '}Рамка листа
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 16 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>
          Шаблоны документов (Положения и должностные инструкции)
        </div>
        {!org || !org.templates ? (
          <>
            <p className="modal-text">Шаблоны ещё не созданы для этой модели.</p>
            <button
              className="btn primary"
              onClick={() => commit((draft) => { if (draft.org) draft.org.templates = { ...DEFAULT_TEMPLATES }; })}
            >
              Создать шаблоны по умолчанию
            </button>
          </>
        ) : (
          <>
            <div className="field-label" style={{ marginBottom: 4 }}>Шаблон «Положение об отделе»</div>
            <textarea
              rows={12}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, marginBottom: 10 }}
              value={org.templates.polozhenie}
              onChange={(e) => commit((draft) => { if (draft.org?.templates) draft.org.templates.polozhenie = e.target.value; }, 'set-pos')}
            />
            <div className="field-label" style={{ marginBottom: 4 }}>Шаблон «Должностная инструкция»</div>
            <textarea
              rows={12}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, marginBottom: 10 }}
              value={org.templates.di}
              onChange={(e) => commit((draft) => { if (draft.org?.templates) draft.org.templates.di = e.target.value; }, 'set-di')}
            />
            <p className="field-hint">
              Теги: {'{{КОМПАНИЯ}} {{ОТДЕЛ}} {{ДОЛЖНОСТЬ}} {{ГРЕЙД}} {{РУКОВОДИТЕЛЬ}} {{ОКЛАД}} {{ДАТА}} '}
              {'{{ОБЩИЕ}} {{ЦЕЛИ}} {{ЭКОНОМИКА}} {{ЗНАНИЯ}} {{ПРАВА}} {{ШТАТ_ИТОГО}}'}; таблицы:{' '}
              {'{{ТАБЛИЦА:ШТАТ}} {{ТАБЛИЦА:ФУНКЦИИ}} {{ТАБЛИЦА:KPI}} {{ТАБЛИЦА:ПРОЦЕССЫ}}'}. Строки «# / ##» — заголовки.
            </p>
            <DocExport />
          </>
        )}
      </section>

      <div className="modal-actions">
        <button className="btn primary" onClick={close}>Готово</button>
      </div>
    </div>
  );
}
