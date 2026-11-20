import { useState } from 'react';
import { useStore, commit } from '../../store';
import type { ReactElement } from 'react';
import {
  coverageGaps, createDepartment, depFots, depTree, formatRub, orgIssues, orgOf, orgSummary,
  roleFots, upsertRole, workIndex, DEP_KIND_TITLE,
  type DepNode, type OrgDepartment, type RoleSuggestion,
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="f-field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function NumField({ label, value, set, step = 1 }: { label: string; value: number; set: (v: number) => void; step?: number }) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next) && next >= 0) set(next);
        }}
      />
    </Field>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="f-card">
      <span className="field-label">{title}</span>
      {children}
    </section>
  );
}

export function OrgDialog({ close, initialTab }: { close: () => void; initialTab?: Tab }) {
  const { model } = useStore();
  const org = orgOf(model);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'struct');
  const [showNewDep, setShowNewDep] = useState(false);
  const [ndName, setNdName] = useState('');
  const [ndKind, setNdKind] = useState<OrgDepartment['kind']>('internal');
  const [ndParent, setNdParent] = useState('');
  const [query, setQuery] = useState('');

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
    <div className="seg" style={{ marginBottom: 14 }}>
      <button className={tab === 'struct' ? 'on' : ''} onClick={() => setTab('struct')}>
        Структура и подразделения
      </button>
      <button className={tab === 'proc' ? 'on' : ''} onClick={() => setTab('proc')}>
        Процессы → должности{gaps.length > 0 ? ` (${gaps.length})` : ''}
      </button>
    </div>
  );

  // ---------------------------------------------------------------- Структура
  const createDepForm = showNewDep && (
    <div className="inline-form">
      <input placeholder="Название подразделения" value={ndName} onChange={(e) => setNdName(e.target.value)} style={{ flex: '1 1 220px' }} />
      <select value={ndKind} onChange={(e) => setNdKind(e.target.value as OrgDepartment['kind'])}>
        <option value="internal">внутреннее</option>
        <option value="service">обслуживание (в договор)</option>
        <option value="development">развитие (проекты)</option>
      </select>
      <select value={ndParent} onChange={(e) => setNdParent(e.target.value)}>
        <option value="">— без вышестоящего —</option>
        {org.departments.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <button
        className="btn primary"
        disabled={!ndName.trim()}
        onClick={() => {
          commit((draft) => {
            if (!draft.org) return;
            createDepartment(draft.org, ndName.trim(), ndKind, ndParent || undefined);
          });
          setShowNewDep(false);
          setNdName('');
          setNdParent('');
        }}
      >
        Создать
      </button>
    </div>
  );

  const structSection = (
    <>
      <div className="fgrid">
        <NumField label="Месяцев в году" value={org.params.months} set={(v) => editOrg((o) => (o.params.months = v), 'org-months')} />
        <NumField label="Взносы, %" value={Math.round(org.params.socialRate * 1000) / 10} set={(v) => editOrg((o) => (o.params.socialRate = v / 100), 'org-social')} step={0.1} />
        <NumField label="Обращений/мес" value={org.params.ticketsPerMonth} set={(v) => editOrg((o) => (o.params.ticketsPerMonth = v), 'org-tickets')} step={10} />
        <NumField label="Пользователей на объекте" value={org.params.usersPerSite} set={(v) => editOrg((o) => (o.params.usersPerSite = v), 'org-users')} step={10} />
      </div>

      <Card title="Иерархия подразделений и цели">
        {dumpTree(tree, 0)}
        <div style={{ marginTop: 10 }}>
          {!showNewDep ? (
            <button className="btn" onClick={() => setShowNewDep(true)}>+ Добавить подразделение</button>
          ) : (
            createDepForm
          )}
        </div>
      </Card>

      {issues.length > 0 && (
        <Card title={`Согласованность с моделью (${issues.length})`}>
          {issues.slice(0, 8).map((issue, i) => (
            <p key={i} className="field-hint">⚠ {issue.text}</p>
          ))}
          {issues.length > 8 && <p className="field-hint">…и ещё {issues.length - 8}</p>}
        </Card>
      )}

      <Card title="Сводка по компании">
        <p className="modal-text">
          Штат <b>{summary.totalFte}</b> ед. · ФОТ <b>{formatRub(summary.fotMonth)}</b>/мес ·{' '}
          <b>{formatRub(summary.fotYear)}</b>/год с взносами · цена обращения L1{' '}
          <b>{formatRub(summary.ticketPrice)}</b>
        </p>
      </Card>

      <Card title="Отделы">
        <div className="table-wrap sticky">
          <table className="zebra">
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
                  <td className="num"><b>{formatRub(d.fotYear)}</b></td>
                  <td className="num">{Math.round(d.share * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Роли и привязка к работам">
        <div className="table-wrap sticky">
          <table className="zebra">
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
                  <td>{(r.role.works ?? []).map((w) => works.get(w)?.num ?? w).join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card-hint">
          Состав ролей и оклады хранятся в файле модели (поле org) — файл остаётся совместимым с исходной Idefka.
        </p>
      </Card>
    </>
  );

  // ---------------------------------------------------------------- Процессы → должности
  const q = query.trim().toLowerCase();
  const gapsFiltered = q
    ? gaps.filter((g) => g.workNum.toLowerCase().includes(q) || g.workName.toLowerCase().includes(q))
    : gaps;

  const procSection = (
    <>
      <p className="modal-text">
        Работы IDEF0 без ответственной роли. Подразделение предложено по области процесса — при создании
        должность сразу попадает в org, в расчёты и во все документы.
      </p>
      <div className="inline-form">
        <input
          placeholder="Поиск по номеру или названию…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: '1 1 240px' }}
        />
        <span className="muted" style={{ fontSize: 12 }}>
          {gaps.length === 0 ? '✓ всё покрыто' : `непокрытых: ${gaps.length}`}
        </span>
      </div>
      {gaps.length === 0 && (
        <p className="modal-text">✓ Все работы модели покрыты ролями — предложений нет.</p>
      )}
      {gapsFiltered.map((gap) => (
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
  const [done, setDone] = useState(false);
  const depMissing = !org.departments.some((d) => d.id === depId);

  const create = () => {
    commit((draft) => {
      if (!draft.org) return;
      if (!draft.org.departments.some((d) => d.id === depId)) {
        createDepartment(draft.org, `Подразделение ${depId} [${gap.workNum}]`, 'internal');
      }
      upsertRole(draft.org, depId, { name, works: [gap.wid] });
    });
    setDone(true);
  };

  if (done) {
    return (
      <div className="gap-row" style={{ opacity: 0.55 }}>
        <span className="gap-num">{gap.workNum}</span>
        <span className="gap-name" style={{ color: 'var(--icom-i)' }}>✓ должность «{name}» создана</span>
        <span />
        <span />
        <button className="btn" onClick={() => setDone(false)}>Отменить</button>
      </div>
    );
  }

  return (
    <div className="gap-row">
      <span className="gap-num">{gap.workNum}</span>
      <span className="gap-name" title={gap.workName}>{gap.workName.split('\n')[0]}</span>
      <select value={depId} onChange={(e) => setDepId(e.target.value)}>
        {!org.departments.some((d) => d.id === depId) && (
          <option value={depId}>{depId} (создать)</option>
        )}
        {org.departments.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <input value={name} onChange={(e) => setName(e.target.value)} title="Название должности" />
      <button className="btn primary" onClick={create} disabled={!name.trim()}>
        {depMissing ? '+ подр. и должность' : '+ должность'}
      </button>
    </div>
  );
}
