import { useEffect, useMemo, useRef, useState } from 'react';
import { setState, useStore } from '../store';
import { validate } from '../model/validate';
import { runAudit } from '../model/consistency';
import type { Model } from '../model/types';
import { diagramOrder, diagramTitle, nodeOf } from '../model/query';
import { NOTATIONS } from '../model/notation';
import { Icon } from './icons';

/**
 * Аудит считается по «успокоившейся» модели: правки инспектора множат коммиты,
 * а полный прогон кросс-правил нужен не на каждый keystroke (см. спецификацию аудита).
 */
function useDebouncedModel(model: Model, delayMs: number): Model {
  const [debounced, setDebounced] = useState(model);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDebounced(model), delayMs);
    return () => window.clearTimeout(timer.current);
  }, [model, delayMs]);
  return debounced;
}

function issuesLabel(total: number) {
  if (!total) return 'Модель соответствует правилам';
  return `Замечаний: ${total}`;
}

export function StatusBar() {
  const { model, diagramId } = useStore();
  const diagram = model.diagrams[diagramId];
  const notation = NOTATIONS[diagram.notation];

  const syntaxIssues = useMemo(() => validate(model), [model]);
  const debouncedModel = useDebouncedModel(model, 400);
  const auditErrors = useMemo(() => runAudit(debouncedModel).summary.error, [debouncedModel]);
  const total = syntaxIssues.length + auditErrors;
  const elements = diagram.boxes.filter((b) => b.kind !== 'text').length;

  return (
    <footer className="statusbar">
      <span className="sb-node">{nodeOf(model, diagramId)}</span>
      <span className="sb-title">{diagramTitle(model, diagramId)}</span>
      <span className="sb-sep" />
      <span>
        {diagram.notation === 'idef0' ? 'Работ' : 'Элементов'}: {elements}
      </span>
      <span>Стрелок: {diagram.arrows.length}</span>
      <span>
        Диаграмм {notation.short}: {diagramOrder(model, diagram.notation).length}
      </span>
      <span className="sb-grow" />
      <button
        className={'sb-issues' + (total ? ' has' : ' ok')}
        onClick={() => setState({ dialog: { kind: 'audit' } })}
        title={`Синтаксис: ${syntaxIssues.length}, кросс-нотационные ошибки аудита: ${auditErrors}`}
      >
        {total ? <Icon.warn /> : <Icon.check />}
        {issuesLabel(total)}
      </button>
    </footer>
  );
}
