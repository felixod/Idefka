import { useState } from 'react';
import { useStore, commit } from '../../store';
import type { ReactElement } from 'react';
import {
  coverageGaps, createDepartment, depFots, depTree, formatRub, orgIssues, orgOf, orgSummary,
  roleFots, upsertRole, workIndex, DEP_KIND_TITLE, type DepNode, type RoleSuggestion,
} from '../../model/org';
import { exportOrgCsv, exportOrgDocs } from '../../actions';
import { Icon } from '../icons';

type Tab = 'struct' | 'proc';

function editOrg(change: (org: NonNullable<ReturnType<typeof orgOf>>) => void, coalesceKey?: string) {
  commit((draft) => {
    if (!draft.org) return;
    change(draft.org);
  }, coalesceKey);
}

const numField = (label: string, value: number, set: (v: number) => void, key: string, step = 1) => (
  <label className="field" key={key}>
    <span className="field-label">{label}</span>
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => {
        const next = Number(e.target.value);
        if (Number.isFinite(next) && next >= 0) set(next);
      }}
    />
  </label>
);

export function OrgDialog({ close, initialTab }: { close: () => void; initialTab?: Tab }) {
  const { model } = useStore();
  const org = orgOf(model);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'struct');

  if (!org) {
    return (
      <div className="abc-dialog">
        <h2>Орг-конструктор</h2>
        <p className="modal-text">
          В этой модели нет раздела <code>org</code>: отделы, роли, оклады и привязка к работам IDEF0.
          Он хранится прямо в файле .idef и добавляется генератором или вручную (JSON-поле «org»).
        </p>
        <div className="modal-actions">
          <button className="btn primary" autoFocus onClick={close}>
            Понятно
          </button>
        </div>
      </div>
    );
  }

  const summary = orgSummary(org);
  const deps = depFots(org);
  const roles = roleFots(org);
  const works = workIndex(model);
  const tree = depTree(org);
  const issues = orgIssues(org, model);
  const gaps = coverageGaps(org, model);

  const dumpTree = (nodes: DepNode[], depth: number): ReactElement[] =>
    nodes.flatMap((node) => [
      <div key={node.dep.id} style={{ paddingLeft: depth * 16 }}>
        <b>{node.dep.name}</b> <span className="muted">({DEP_KIND_TITLE[node.dep.kind] ?? node.dep.kind})</span>
        {node.dep.goals?.map((goal, i) => (
          <div key={i} className="muted" style={{ paddingLeft: 16 }}>
            • {goal}
          </div>
        ))}
      </div>,
      ...dumpTree(node.children, depth + 1),
    ]);

  const tabsRow = (
    <div className="tabs" style={{ marginBottom: 12 }}>
      <button className={tab === 'struct' ? 'on' : ''} onClick={() => setTab('struct')}>
        Структура и подразделения
      </button>
      <button className={tab === 'proc' ? 'on' : ''} onClick={() => setTab('proc')}>
        Процессы → должности {gaps.length > 0 && <span className="count">{gaps.length}</span>}
      </button>
    </div>
  );

  const structSection = (
    <>
      <div className="two-cols" style={{ gap: 10, marginBottom: 12 }}>
        {numField('Месяцев в году', org.params.months, (v) => editOrg((o) => (o.params.months = v), 'org-months'), 'months')}
        {numField('Взносы, %', Math.round(org.params.socialRate * 1000) / 10, (v) => editOrg((o) => (o.params.socialRate = v / 100), 'org-social'), 'social', 0.1)}
        {numField('Обращений/мес', org.params.ticketsPerMonth, (v) => editOrg((o) => (o.params.ticketsPerMonth = v), 'org-tickets'), 'tickets', 10)}
        {numField('Пользователей на объекте', org.params.usersPerSite, (v) => editOrg((o) => (o.params.usersPerSite = v), 'org-users'), 'users', 10)}
      </div>

      <section style={{ marginBottom: 12 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>
          Иерархия подразделений и цели
        </div>
        {dumpTree(tree, 0)}
      </section>

      {issues.length > 0 && (
        <section style={{ marginBottom: 12 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            Согласованность с моделью ({issues.length})
          </div>
          {issues.slice(0, 8).map((issue, i) => (
            <p key={i} className="field-hint">
              ⚠ {issue.text}
            </p>
          ))}
          {issues.length > 8 && <p className="field-hint">…и ещё {issues.length - 8}</p>}
        </section>
      )}

      <section style={{ marginBottom: 12 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>
          Сводка по компании
        </div>
        <p className="modal-text">
          Штат <b>{summary.totalFte}</b> ед. · ФОТ <b>{formatRub(summary.fotMonth)}</b>/мес ·{' '}
          <b>{formatRub(summary.fotYear)}</b>/год с взносами · цена обращения L1{' '}
          <b>{formatRub(summary.ticketPrice)}</b>
        </p>
      </section>

      <section style={{ marginBottom: 12 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>
          Отделы
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Отдел</th>
                <th className="num">Штат</th>
                <th className="num">ФОТ/мес</th>
                <th className="num">ФОТ/год (с взносами)</th>
                <th className="num">Доля</th>
              </tr>
            </thead>
            <tbody>
              {deps.map((d) => (
                <tr key={d.dep.id}>
                  <td>{d.dep.name}</td>
                  <td className="num">{d.fte}</td>
                  <td className="num">{formatRub(d.fotMonth)}</td>
                  <td className="num">
                    <b>{formatRub(d.fotYear)}</b>
                  </td>
                  <td className="num">{Math.round(d.share * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="abc-report">
        <div className="field-label" style={{ marginBottom: 6 }}>
          Роли и привязка к работам
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Роль</th>
                <th>Отдел</th>
                <th>Грейд</th>
                <th className="num">FTE</th>
                <th className="num">Оклад</th>
                <th className="num">₽/год</th>
                <th>Работы</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.role.id}>
                  <td>{r.role.name}</td>
                  <td>{r.dep.name}</td>
                  <td>{r.role.grade}</td>
                  <td className="num">{r.role.fte}</td>
                  <td className="num">
                    {r.role.salaryMin.toLocaleString('ru-RU')}–{r.role.salaryMax.toLocaleString('ru-RU')}
                  </td>
                  <td className="num">{formatRub(r.fotYear)}</td>
                  <td>
                    {(r.role.works ?? [])
                      .map((w) => works.get(w)?.num ?? w)
                      .join(' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );

  const procSection = (
    <>
      <p className="modal-text">
        Дерево работ IDEF0 без ответственной роли. Для каждой — предложение: подразделение (по области
        процесса), название должности. Созданная должность сразу попадает в org и во все документы.
      </p>
      {gaps.length === 0 && (
        <p className="modal-text">✓ Все работы модели покрыты ролями — предложений нет.</p>
      )}
      {gaps.map((gap) => (
        <GapRow key={gap.wid} gap={gap} org={org} />
      ))}
    </>
  );

  return (
    <div className="abc-dialog">
      <h2>Орг-конструктор</h2>
      {tabsRow}
      {tab === 'struct' && structSection}
      {tab === 'proc' && procSection}

      <div className="modal-actions">
        <button className="btn" onClick={exportOrgCsv}>
          <Icon.money />
          Смета ФОТ (CSV)
        </button>
        <button className="btn" onClick={exportOrgDocs}>
          <Icon.table />
          Положения и ДИ (Markdown)
        </button>
        <button className="btn primary" onClick={close}>
          Готово
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- строка предложения
function GapRow({ gap, org }: { gap: RoleSuggestion; org: NonNullable<ReturnType<typeof orgOf>> }) {
  const [depId, setDepId] = useState(gap.suggestedDepId);
  const [name, setName] = useState(gap.suggestedRoleName);
  const depMissing = !org.departments.some((d) => d.id === depId);

  const create = () => {
    commit((draft) => {
      if (!draft.org) return;
      if (!draft.org.departments.some((d) => d.id === depId)) {
        createDepartment(draft.org, `Подразделение ${depId} [${gap.workNum}]`, 'internal');
      }
      upsertRole(draft.org, depId, { name, works: [gap.wid] });
    });
  };

  return (
    <div className="center-row" style={{ alignItems: 'center', gap: 8, padding: '6px 0', flexWrap: 'wrap' }}>
      <b style={{ minWidth: 52 }}>{gap.workNum}</b>
      <span style={{ flex: '1 1 260px' }} className="muted">{gap.workName.split('\n')[0]}</span>
      <select value={depId} onChange={(e) => setDepId(e.target.value)} style={{ maxWidth: 220 }}>
        {!org.departments.some((d) => d.id === depId) && (
          <option value={depId}>{depId} (создать)</option>
        )}
        {org.departments.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ width: 220 }}
        title="Название должности"
      />
      <button className="btn primary" onClick={create} disabled={!name.trim()}>
        {depMissing ? 'Создать подразделение и должность' : 'Создать должность'}
      </button>
    </div>
  );
}
