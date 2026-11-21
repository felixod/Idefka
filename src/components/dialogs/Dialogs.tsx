import { setState, useStore, type DialogState } from '../../store';
import { fileName } from '../TopBar';
import { AbcDialog } from './AbcDialog';
import { AuditDialog } from './AuditDialog';
import { DecomposeDialog } from './DecomposeDialog';
import { NewModelDialog } from './NewModelDialog';
import { OrgDialog } from './OrgDialog';
import { SettingsDialog } from './SettingsDialog';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

type UnsavedDialog = Extract<DialogState, { kind: 'unsaved' }>;

const SHORTCUTS: [string, string][] = [
  ['V / A / H', 'Выбор / стрелка / рука'],
  ['B, 2…9, 0', 'Элементы нотации по порядку на панели слева'],
  ['Пробел + мышь, средняя кнопка', 'Двигать лист'],
  ['Колесо мыши', 'Масштаб под курсором'],
  ['Ctrl+0', 'Вписать лист в окно'],
  ['Двойной щелчок, F2', 'Переименовать'],
  ['Shift+Enter', 'Новая строка в названии'],
  ['Тянуть за отрезок стрелки', 'Сдвинуть отрезок'],
  ['A + тянуть от стрелки, Alt + тянуть', 'Ветвь стрелки (IDEF0, DFD, IDEF3, BPMN)'],
  ['Тянуть от линии жизни к другой', 'Сообщение (диаграмма последовательности)'],
  ['Бросить конец на стрелку', 'Слияние стрелок'],
  ['Отвести подпись от стрелки', 'Появится «молния» к стрелке'],
  ['D', 'Декомпозировать или открыть декомпозицию'],
  ['Alt+↑', 'На уровень выше'],
  ['Shift + щелчок, рамка', 'Выделить несколько'],
  ['Стрелки клавиатуры', 'Сдвинуть выделенное (Shift — сильнее)'],
  ['Delete', 'Удалить выделенное'],
  ['Delete на граничной стрелке', 'Убрать её в туннель (IDEF0)'],
  ['Ctrl+Z / Ctrl+Y', 'Отменить / повторить'],
  ['Ctrl+S / Ctrl+Shift+S', 'Сохранить / сохранить как'],
  ['Ctrl+O, Alt+N', 'Открыть / новая модель'],
  ['Ctrl+P', 'Печать или PDF всей модели'],
];

function UnsavedChanges({ dialog, modelName }: { dialog: UnsavedDialog; modelName: string }) {
  return (
    <>
      <h2>Сохранить изменения?</h2>
      <p className="modal-text">В модели «{modelName}» есть несохранённые изменения.</p>
      <div className="modal-actions">
        <button className="btn" onClick={() => dialog.resolve('cancel')}>
          Отмена
        </button>
        <button className="btn" onClick={() => dialog.resolve('discard')}>
          Не сохранять
        </button>
        <button className="btn primary" autoFocus onClick={() => dialog.resolve('save')}>
          Сохранить
        </button>
      </div>
    </>
  );
}

function Shortcuts({ close }: { close: () => void }) {
  return (
    <>
      <h2>Горячие клавиши</h2>
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map(([keys, action]) => (
            <tr key={keys}>
              <td>
                <kbd>{keys}</kbd>
              </td>
              <td>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="modal-actions">
        <button className="btn primary" autoFocus onClick={close}>
          Понятно
        </button>
      </div>
    </>
  );
}

function About({ close }: { close: () => void }) {
  return (
    <>
      <div className="about-logo">
        <img className="brand-full brand-light" src="./logo-company.svg" alt="Логотип" />
        <img className="brand-full brand-dark" src="./logo-company-white.svg" alt="Логотип" />
      </div>
      <h2>
        Idefka <span className="muted">{APP_VERSION}</span>
      </h2>
      <p className="modal-text">
        Редактор диаграмм IDEF0, DFD, IDEF3, BPMN, EPC, UML и ERD со стоимостным анализом. Работает в браузере и без интернета. Модели хранятся в открытом формате JSON (файлы .idef) у вас на
        компьютере.
      </p>
      <div className="modal-actions">
        <button className="btn primary" autoFocus onClick={close}>
          Закрыть
        </button>
      </div>
    </>
  );
}

function DialogBody({ dialog, close, modelName }: { dialog: DialogState; close: () => void; modelName: string }) {
  switch (dialog.kind) {
    case 'decompose':
      return <DecomposeDialog boxId={dialog.boxId} close={close} />;
    case 'new':
      return <NewModelDialog close={close} />;
    case 'abc':
      return <AbcDialog close={close} />;
    case 'org':
      return <OrgDialog close={close} initialTab={dialog.tab} />;
    case 'audit':
      return <AuditDialog close={close} />;
    case 'settings':
      return <SettingsDialog close={close} />;
    case 'unsaved':
      return <UnsavedChanges dialog={dialog} modelName={modelName} />;
    case 'shortcuts':
      return <Shortcuts close={close} />;
    case 'about':
      return <About close={close} />;
  }
}

export function Dialogs() {
  const { dialog, filePath, model } = useStore();
  if (!dialog) return null;

  const close = () => {
    if (dialog.kind === 'unsaved') dialog.resolve('cancel');
    else setState({ dialog: null });
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className={'modal' + (dialog.kind === 'abc' || dialog.kind === 'org' || dialog.kind === 'audit' ? ' wide' : '')} role="dialog" aria-modal>
        <DialogBody dialog={dialog} close={close} modelName={fileName(filePath) ?? model.meta.name} />
      </div>
    </div>
  );
}

export function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return (
    <div className="toast" key={toast.id} role="status">
      {toast.text}
    </div>
  );
}
