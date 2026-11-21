import { useMemo, useState } from 'react';
import { getState, select, useStore } from '../../store';
import { validate, type Issue } from '../../model/validate';
import { runAudit, RULES_VERSION, type AuditReport, type AuditLevel, type Finding } from '../../model/consistency';
import { openDiagram } from '../../actions';
import { Icon } from '../icons';

function goToFinding(finding: Finding) {
  if (!finding.diagramId) return;
  openDiagram(finding.diagramId, finding.boxId);
  if (!finding.boxId && finding.arrowId) select({ arrows: [finding.arrowId] });
}

function goToIssue(issue: Issue) {
  openDiagram(issue.diagram);
  if (issue.kind === 'box') select({ boxes: [issue.id] });
  if (issue.kind === 'arrow') select({ arrows: [issue.id] });
}

const LEVEL_LABEL: Record<AuditLevel, string> = { ERROR: 'ОШИБКИ', WARN: 'ПРЕДУПРЕЖДЕНИЯ', INFO: 'СВЕДЕНИЯ' };

function Chip({ level, count }: { level: AuditLevel; 'count': number }) {
  return (
    <span className={`audit-chip ${level.toLowerCase()}`}>
      {LEVEL_LABEL[level]} <b>{count}</b>
    </span>
  );
}

function SyntaxSection({ issues }: { issues: Issue[] }) {
  const [open, setOpen] = useState(false);
  if (!issues.length) return null;
  return (
    <section className="f-card audit-syntax">
      <button className="audit-rule-head" onClick={() => setOpen(!open)}>
        <span className="audit-rule-id warn">Синтаксис</span>
        <span className="audit-rule-title">Локальные правила нотаций (validate) × {issues.length}</span>
        <span className="audit-count">{open ? 'скрыть' : 'показать'}</span>
      </button>
      {open && (
        <div className="audit-findings">
          {issues.map((issue, i) => (
            <button key={i} className="audit-finding" onClick={() => goToIssue(issue)}>
              <Icon.warn />
              {issue.text}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function IssuesTab({ report, issues }: { report: AuditReport; issues: Issue[] }) {
  return (
    <>
      <SyntaxSection issues={issues} />
      {report.groups.map((group) => {
        const failed = group.outcomes.filter((o) => o.findings.length || o.waived.length);
        if (!failed.length) return null;
        return (
          <section key={group.key} className="f-card">
            <div className="field-label">
              {group.title}
              {group.error > 0 && <span className="audit-count err"> ×{group.error} ERROR</span>}
              {group.warn > 0 && <span className="audit-count warn"> ×{group.warn} WARN</span>}
              {group.info > 0 && <span className="audit-count"> ×{group.info} INFO</span>}
            </div>
            {failed.map((outcome) => (
              <details key={outcome.rule} className="audit-rule">
                <summary className="audit-rule-head">
                  <span className={`audit-rule-id ${outcome.level.toLowerCase()}`}>{outcome.rule}</span>
                  <span className="audit-rule-title">{outcome.title}</span>
                  <span className={`audit-count ${outcome.level.toLowerCase()}`}>×{outcome.findings.length}</span>
                  {outcome.waived.length > 0 && <span className="audit-count">обходов: {outcome.waived.length}</span>}
                </summary>
                <p className="audit-rule-desc">{outcome.description}</p>
                <div className="audit-findings">
                  {outcome.findings.map((finding, i) => (
                    <button key={i} className="audit-finding" onClick={() => goToFinding(finding)} title={finding.hint}>
                      {finding.level === 'ERROR' ? <Icon.warn /> : <Icon.check />}
                      <span className="audit-finding-text">
                        {finding.text}
                        {finding.hint && <em> {finding.hint}</em>}
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </section>
        );
      })}
      {!issues.length && !report.findings.length && (
        <section className="f-card">
          <p className="modal-text">Модель проходит все правила кросс-нотационной согласованности.</p>
        </section>
      )}
    </>
  );
}

function RunTab({ report, runAt, rerun, model }: { report: AuditReport; runAt: number; rerun: () => void; model: string }) {
  const cov = report.coverage;
  const percent = (n: number) => `${n}/${cov.leafWorks} (${cov.leafWorks ? Math.round((n / cov.leafWorks) * 100) : 0}%)`;
  const exportJson = () => {
    const payload = { schemaVersion: '1.0', rulesVersion: RULES_VERSION, model, summary: report.summary, coverage: { leafWorks: cov.leafWorks, byNotation: cov.byNotation }, findings: report.findings, waived: report.waived, passes: report.passes };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'model-audit.json';
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <>
      <section className="f-card">
        <div className="field-label">Последний прогон</div>
        <p className="modal-text">
          Время: {new Date(runAt).toLocaleTimeString()} · длительность {report.durationMs} мс · правила v{RULES_VERSION}
        </p>
        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn primary" onClick={rerun}>
            Прогнать все
          </button>
          <button className="btn" onClick={exportJson}>
            Экспорт JSON
          </button>
        </div>
      </section>
      <section className="f-card">
        <div className="field-label">Покрытие листовых работ ({cov.leafWorks})</div>
        <div className="table-wrap">
          <table className="zebra">
            <thead>
              <tr>
                <th>Процессное (BPMN∪IDEF3∪EPC∪Activity)</th>
                <th>DFD</th>
                <th>Прецеденты</th>
                <th>Оргроли</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{percent(cov.byNotation.anyProcess)}</td>
                <td>{percent(cov.byNotation.dfd)}</td>
                <td>{percent(cov.byNotation.uc)}</td>
                <td>{percent(cov.byNotation.org)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="f-card">
        <div className="field-label">Зелёный каркас: правила без нарушений ({report.passes.length})</div>
        <ul className="audit-passes">
          {report.passes.map((pass) => (
            <li key={pass.rule}>
              <b>{pass.rule}</b> {pass.title} — <span className="muted">{pass.detail}</span>
            </li>
          ))}
          {!report.passes.length && <li className="muted">Все правила с находками — см. вкладку «Проблемы».</li>}
        </ul>
      </section>
    </>
  );
}

export function AuditDialog({ close }: { close: () => void }) {
  const { model, filePath } = useStore();
  const [tab, setTab] = useState<'issues' | 'run'>('issues');
  const [run, setRun] = useState(() => ({ report: runAudit(model), at: Date.now() }));
  // Синтаксис считаем один раз при открытии: пока диалог открыт, модель не меняется.
  const issues = useMemo(() => validate(model), [model]);
  const modelName = filePath ? filePath.split(/[\\/]/).pop() ?? model.meta.name : model.meta.name;

  const rerun = () => setRun({ report: runAudit(getState().model), at: Date.now() });

  return (
    <div className="audit-dialog">
      <h2>Проверка модели</h2>
      <p className="modal-text">
        Кросс-нотационная согласованность: трассировка [A-тегов], функции ↔ процессы, DFD ↔ ERD, UML ↔ роли, ДИ/Положения. Клик по находке
        открывает элемент на диаграмме.
      </p>
      <div className="audit-summary">
        <Chip level="ERROR" count={run.report.summary.error} />
        <Chip level="WARN" count={run.report.summary.warn} />
        <Chip level="INFO" count={run.report.summary.info} />
        {run.report.summary.waived > 0 && (
          <span className="audit-chip">
            ОБХОДЫ <b>{run.report.summary.waived}</b>
          </span>
        )}
        <span className="audit-chip">
          СИНТАКСИС <b>{issues.length}</b>
        </span>
        <span className="sb-grow" />
        <div className="tabs audit-tabs">
          <button className={tab === 'issues' ? 'on' : ''} onClick={() => setTab('issues')}>
            Проблемы
          </button>
          <button className={tab === 'run' ? 'on' : ''} onClick={() => setTab('run')}>
            Прогон
          </button>
        </div>
      </div>
      <div className="audit-body">
        {tab === 'issues' ? <IssuesTab report={run.report} issues={issues} /> : <RunTab report={run.report} runAt={run.at} rerun={rerun} model={modelName} />}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={rerun}>
          Прогнать все
        </button>
        <button className="btn primary" onClick={close}>
          Готово
        </button>
      </div>
    </div>
  );
}
