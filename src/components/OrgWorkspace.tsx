// Полноэкранный «Орг-конструктор»: master–detail (дерево слева, детали/покрытие/экономика справа).
// Заменяет модалку OrgDialog: редактирование подразделений и ролей, works-picker,
// матрица покрытия с кликом на диаграммы, параметры экономики.
import { useMemo, useState } from 'react';
import { commit, setState, useStore } from '../store';
import { openDiagram } from '../actions/navigation';
import { select } from '../store';
import {
  contractPrice, coverageGaps, createDepartment, depFots, depTree, formatRub, orgIssues, orgOf,
  orgSummary, roleFots, upsertRole, workIndex, DEP_KIND_TITLE,
  type DepNode, type RoleSuggestion,
} from '../model/org';
import { exportOrgCsv, exportOrgDocs } from '../actions';
import { Icon } from './icons';
import type { OrgDepartment, OrgRole } from '../model/types';

type Section = 'tree' | 'cover' | 'econ';
type Sel = { kind: 'dep'; id: string } | { kind: 'role'; id: string } | null;

function editOrg(change: (org: NonNullable<ReturnType<typeof orgOf>>) => void, coalesceKey?: string) {
  commit((draft) => {
    if (!draft.org) return;
    change(draft.org);
  }, coalesceKey);
}

export function OrgWorkspace({ close, initialTab }: { close: () => void; initialTab?: string }) {
  const { model } = useStore();
  const org = orgOf(model);
  const [section, setSection] = useState<Section>(initialTab === 'proc' ? 'cover' : 'tree');
  const [sel, setSel] = useState<Sel>(null);
  const [query, setQuery] = useState('');

  const works = useMemo(() => workIndex(model), [model]);
  const workDiagram = useMemo(() => {
    const map = new Map<string, string>();
    for (const [did, d] of Object.entries(model.diagrams)) {
      if (d.notation !== 'idef0') continue;
      for (const b of d.boxes) if (b.kind === 'activity' && !map.has(b.id)) map.set(b.id, did);
    }
    return map;
  }, [model]);

  if (!org) {
    return (
      <div className="org-ws">
        <div className="org-ws-head">
          <b>Орг-конструктор</b>
          <span className="muted">в модели нет раздела org — создайте структуру</span>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>Закрыть</button>
        </div>
        <div style={{ padding: 24 }}>
          <button className="btn primary" onClick={() => editOrg((o) => { o.departments.push({ id: 'HQ', name: 'Дирекция ИТ-компании', kind: 'internal', mission: '', goals: [], roles: [] }); })}>
            Создать корневое подразделение
          </button>
        </div>
      </div>
    );
  }

  const roles = roleFots(org);
  const deps = depFots(org);
  const tree = depTree(org);
  const summary = orgSummary(org);
  const contract = contractPrice(org);
  const issues = orgIssues(org, model);
  const gaps = coverageGaps(org, model);
  const byRole = new Map(roles.map((r) => [r.role.id, r]));
  const byDep = new Map(org.departments.map((d) => [d.id, d]));
  const selectedDep = sel?.kind === 'dep' ? byDep.get(sel.id) : undefined;
  const selectedRole = sel?.kind === 'role' ? byRole.get(sel.id) : undefined;

  const goWork = (wid: string) => {
    const did = workDiagram.get(wid);
    if (!did) return;
    close();
    openDiagram(did, wid);
    select({ boxes: [wid], arrows: [] });
  };

  const q = query.trim().toLowerCase();
  const matchNode = (name: string) => !q || name.toLowerCase().includes(q);

  const renderTree = (nodes: DepNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const dep = node.dep;
      const depRoles = roles.filter((r) => r.dep.id === dep.id);
      const show = matchNode(dep.name) || depRoles.some((r) => matchNode(r.role.name));
      return (
        <div key={dep.id}>
          {show && (
            <div
              className={'org-tree-row' + (sel?.kind === 'dep' && sel.id === dep.id ? ' on' : '')}
              style={{ paddingLeft: depth * 14 }}
              onClick={() => setSel({ kind: 'dep', id: dep.id })}
            >
              <Icon.chevron className="org-tree-caret" />
              <b>{dep.name}</b>
              <span className="muted org-tree-meta">{depRoles.reduce((s, r) => s + r.role.fte, 0)} ед.</span>
            </div>
          )}
          {(show || matchNode(dep.name)) &&
            depRoles.filter((r) => show || matchNode(r.role.name)).map((r) => (
              <div
                key={r.role.id}
                className={'org-tree-row role' + (sel?.kind === 'role' && sel.id === r.role.id ? ' on' : '')}
                style={{ paddingLeft: depth * 14 + 22 }}
                onClick={() => setSel({ kind: 'role', id: r.role.id })}
              >
                {r.role.name}
                <span className="muted org-tree-meta">{r.role.grade}·{r.role.fte}</span>
              </div>
            ))}
          {renderTree(node.children, depth + 1)}
        </div>
      );
    });

  return (
    <div className="org-ws">
      <div className="org-ws-head">
        <b>Орг-конструктор</b>
        <span className="org-ws-stat" title="Штатных единиц">👥 {summary.totalFte}</span>
        <span className="org-ws-stat" title="ФОТ/мес с взносами">💰 {formatRub(summary.fotMonth)}</span>
        <span className="org-ws-stat" title="Цена договора/год (ABC)" onClick={() => setSection('econ')} role="button">📜 {formatRub(contract.priceYear)}</span>
        {issues.length > 0 && <span className="org-ws-stat warn" title={issues.slice(0, 3).map((i) => i.text).join('\n')}>⚠ {issues.length}</span>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={exportOrgCsv} title="CSV для Excel">Смета (CSV)</button>
        <button className="btn" onClick={exportOrgDocs} title="Markdown">Положения и ДИ (MD)</button>
        <button className="btn primary" onClick={close}>Закрыть</button>
      </div>

      <div className="org-ws-body">
        <aside className="org-ws-side">
          <input className="org-search" placeholder="Поиск подразделения или должности…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="org-tree">{renderTree(tree, 0)}</div>
          <button
            className="btn org-add-dep"
            onClick={() => editOrg((o) => { const id = createDepartment(o, 'Новое подразделение', 'internal'); setSel({ kind: 'dep', id }); })}
          >
            + Подразделение
          </button>
        </aside>

        <main className="org-ws-main">
          <div className="seg" style={{ marginBottom: 12 }}>
            <button className={section === 'tree' ? 'on' : ''} onClick={() => setSection('tree')}>Детали</button>
            <button className={section === 'cover' ? 'on' : ''} onClick={() => setSection('cover')}>
              Покрытие{gaps.length ? ` (${gaps.length})` : ' ✓'}
            </button>
            <button className={section === 'econ' ? 'on' : ''} onClick={() => setSection('econ')}>Экономика</button>
          </div>

          {section === 'tree' && (selectedDep ? (
            <DepDetails dep={selectedDep} roles={roles} byRole={byRole} byDep={byDep} works={works} goWork={goWork} onSel={setSel} />
          ) : selectedRole ? (
            <RoleDetails r={selectedRole!} org={org} roles={roles} byDep={byDep} byRole={byRole} works={works} goWork={goWork} />
          ) : (
            <p className="modal-text">Выберите подразделение или должность в дереве слева — здесь появятся редактируемые детали.</p>
          ))}

          {section === 'cover' && <Coverage org={org} works={works} workDiagram={workDiagram} goWork={goWork} gaps={gaps} />}
          {section === 'econ' && <Economics org={org} summary={summary} contract={contract} />}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Детали подразделения
function DepDetails({ dep, roles, byRole, byDep, works, goWork, onSel }: {
  dep: OrgDepartment;
  roles: ReturnType<typeof roleFots>;
  byRole: Map<string, ReturnType<typeof roleFots>[number]>;
  byDep: Map<string, OrgDepartment>;
  works: ReturnType<typeof workIndex>;
  goWork: (wid: string) => void;
  onSel: (s: Sel) => void;
}) {
  const depRoles = roles.filter((r) => r.dep.id === dep.id);
  const upd = (patch: Partial<OrgDepartment>) => editOrg((o) => {
    const d = o.departments.find((x) => x.id === dep.id);
    if (d) Object.assign(d, patch);
  }, 'dep-' + dep.id);
  return (
    <>
      <section className="f-card">
        <span className="field-label">Подразделение</span>
        <div className="fgrid">
          <label className="f-field"><span className="field-label">Название</span>
            <input value={dep.name} onChange={(e) => upd({ name: e.target.value })} /></label>
          <label className="f-field"><span className="field-label">Тип</span>
            <select value={dep.kind} onChange={(e) => upd({ kind: e.target.value as OrgDepartment['kind'] })}>
              <option value="internal">обеспечение</option>
              <option value="service">обслуживание (в договор)</option>
              <option value="development">развитие (проекты)</option>
            </select></label>
          <label className="f-field"><span className="field-label">Вышестоящее</span>
            <select value={dep.parentId ?? ''} onChange={(e) => upd({ parentId: e.target.value || undefined })}>
              <option value="">— корневое —</option>
              {[...byDep.values()].filter((d) => d.id !== dep.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></label>
        </div>
        <label className="f-field" style={{ marginBottom: 10 }}><span className="field-label">Миссия</span>
          <input value={dep.mission} onChange={(e) => upd({ mission: e.target.value })} /></label>
        <label className="f-field"><span className="field-label">Цели (по одной в строке)</span>
          <textarea rows={4} className="tpl-area" value={(dep.goals ?? []).join('\n')}
            onChange={(e) => upd({ goals: e.target.value.split('\n').filter((x) => x.trim()) })} /></label>
      </section>

      <section className="f-card">
        <span className="field-label">Должности ({depRoles.length})</span>
        {depRoles.map((r) => (
          <div key={r.role.id} className="org-role-line" onClick={() => onSel({ kind: 'role', id: r.role.id })}>
            <b>{r.role.name}</b>
            <span className="muted">{r.role.grade} · {r.role.fte} FTE</span>
            <span className="org-role-works">
              {(r.role.works ?? []).slice(0, 8).map((w) => (
                <a key={w} role="button" title={works.get(w)?.name} onClick={(e) => { e.stopPropagation(); goWork(w); }}>
                  {works.get(w)?.num ?? w}
                </a>
              ))}
            </span>
          </div>
        ))}
        <button className="btn" onClick={() => editOrg((o) => upsertRole(o, dep.id, { name: 'Новая должность', works: [] }))}>+ Должность</button>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- Детали должности
function RoleDetails({ r, org, roles, byDep, byRole, works, goWork }: {
  r: ReturnType<typeof roleFots>[number];
  org: NonNullable<ReturnType<typeof orgOf>>;
  roles: ReturnType<typeof roleFots>;
  byDep: Map<string, OrgDepartment>;
  byRole: Map<string, ReturnType<typeof roleFots>[number]>;
  works: ReturnType<typeof workIndex>;
  goWork: (wid: string) => void;
}) {
  const [wq, setWq] = useState('');
  const role = r.role;
  const upd = (patch: Partial<OrgRole>) => editOrg((o) => {
    for (const d of o.departments) {
      const x = d.roles.find((y) => y.id === role.id);
      if (x) { Object.assign(x, patch); break; }
    }
  }, 'role-' + role.id);
  const toggleWork = (wid: string) => editOrg((o) => {
    for (const d of o.departments) {
      const x = d.roles.find((y) => y.id === role.id);
      if (x) {
        x.works = (x.works ?? []).includes(wid) ? (x.works ?? []).filter((w) => w !== wid) : [...(x.works ?? []), wid];
        break;
      }
    }
  });
  const allWorks = [...works.entries()].filter(([id]) => id !== 'a0').sort((a, b) => a[1].num.localeCompare(b[1].num));
  const wFiltered = allWorks.filter(([id, w]) => !wq.trim() || w.num.toLowerCase().includes(wq.toLowerCase()) || w.name.toLowerCase().includes(wq.toLowerCase()));
  return (
    <>
      <section className="f-card">
        <span className="field-label">Должность — {byDep.get(r.dep.id)?.name}</span>
        <div className="fgrid">
          <label className="f-field"><span className="field-label">Название</span>
            <input value={role.name} onChange={(e) => upd({ name: e.target.value })} /></label>
          <label className="f-field"><span className="field-label">Грейд</span>
            <select value={role.grade} onChange={(e) => upd({ grade: e.target.value })}>
              {['Junior', 'Middle', 'Senior', 'Lead', 'Principal'].map((g) => <option key={g}>{g}</option>)}
            </select></label>
          <label className="f-field"><span className="field-label">FTE</span>
            <input type="number" step={0.5} min={0} value={role.fte} onChange={(e) => upd({ fte: Number(e.target.value) || 0 })} /></label>
          <label className="f-field"><span className="field-label">Руководитель</span>
            <select value={role.reportsTo ?? ''} onChange={(e) => upd({ reportsTo: e.target.value || undefined })}>
              <option value="">— директор —</option>
              {roles.filter((x) => x.role.id !== role.id).map((x) => <option key={x.role.id} value={x.role.id}>{x.role.name}</option>)}
            </select></label>
          <label className="f-field"><span className="field-label">Оклад от, ₽/мес</span>
            <input type="number" step={5000} value={role.salaryMin} onChange={(e) => upd({ salaryMin: Number(e.target.value) })} /></label>
          <label className="f-field"><span className="field-label">Оклад до, ₽/мес</span>
            <input type="number" step={5000} value={role.salaryMax} onChange={(e) => upd({ salaryMax: Number(e.target.value) })} /></label>
        </div>
        <p className="card-hint">Оклады — только для расчётов (ABC/смета); в Положения и ДИ суммы не попадают.</p>
      </section>

      <section className="f-card">
        <span className="field-label">Работы IDEF0 ({(role.works ?? []).length}) — кликните для перехода к диаграмме</span>
        <input className="org-search" placeholder="Поиск работы (номер/название)…" value={wq} onChange={(e) => setWq(e.target.value)} style={{ marginBottom: 8 }} />
        <div className="org-works-picker">
          {wFiltered.map(([id, w]) => (
            <label key={id} className={'org-work-chk' + ((role.works ?? []).includes(id) ? ' on' : '')}>
              <input type="checkbox" checked={(role.works ?? []).includes(id)} onChange={() => toggleWork(id)} />
              <b onClick={(e) => { e.preventDefault(); goWork(id); }} role="button">{w.num}</b>
              <span title={w.name}>{w.name.split('\n')[0]}</span>
            </label>
          ))}
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- Покрытие
function Coverage({ org, works, goWork, gaps }: {
  org: NonNullable<ReturnType<typeof orgOf>>;
  works: ReturnType<typeof workIndex>;
  workDiagram: Map<string, string>;
  goWork: (wid: string) => void;
  gaps: RoleSuggestion[];
}) {
  const depCols = org.departments;
  const cover = new Map<string, Set<string>>(); // wid -> depIds
  for (const d of org.departments) {
    for (const r of d.roles) for (const w of r.works ?? []) {
      if (!cover.has(w)) cover.set(w, new Set());
      cover.get(w)!.add(d.id);
    }
  }
  const rows = [...works.entries()].filter(([id]) => id !== 'a0').sort((a, b) => a[1].num.localeCompare(b[1].num));
  return (
    <>
      {gaps.length > 0 && (
        <section className="f-card">
          <span className="field-label">Работы без ответственной роли ({gaps.length})</span>
          {gaps.map((g) => (
            <div key={g.wid} className="gap-row">
              <span className="gap-num" role="button" onClick={() => goWork(g.wid)} title="Перейти к работе">{g.workNum}</span>
              <span className="gap-name">{g.workName.split('\n')[0]}</span>
              <span />
              <span className="muted">{DEP_KIND_TITLE[org.departments.find((d) => d.id === g.suggestedDepId)?.kind ?? 'internal']}: предложить в {org.departments.find((d) => d.id === g.suggestedDepId)?.name ?? g.suggestedDepId}</span>
              <button className="btn primary" onClick={() => editOrg((o) => {
                if (!o.departments.some((d) => d.id === g.suggestedDepId)) createDepartment(o, `Подразделение ${g.suggestedDepId}`, 'internal');
                upsertRole(o, g.suggestedDepId, { name: g.suggestedRoleName, works: [g.wid] });
              })}>+ должность</button>
            </div>
          ))}
        </section>
      )}
      <section className="f-card">
        <span className="field-label">Матрица: работы × подразделения (• = роль отдела исполняет работу)</span>
        <div className="table-wrap sticky" style={{ maxHeight: '52vh' }}>
          <table className="zebra org-cover-table">
            <thead>
              <tr>
                <th className="sticky-col">Работа</th>
                {depCols.map((d) => <th key={d.id} title={d.name}>{d.id}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(([id, w]) => {
                const set = cover.get(id);
                return (
                  <tr key={id}>
                    <td className="sticky-col">
                      <a role="button" onClick={() => goWork(id)} title={w.name}><b>{w.num}</b> {w.name.split('\n')[0].slice(0, 34)}</a>
                    </td>
                    {depCols.map((d) => (
                      <td key={d.id} className="num" title={set?.has(d.id) ? d.name : ''}>{set?.has(d.id) ? '•' : ''}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- Экономика (параметры, без документов)
function Economics({ org, summary, contract }: {
  org: NonNullable<ReturnType<typeof orgOf>>;
  summary: ReturnType<typeof orgSummary>;
  contract: ReturnType<typeof contractPrice>;
}) {
  const num = (label: string, value: number, set: (v: number) => void, step = 1) => (
    <label className="f-field"><span className="field-label">{label}</span>
      <input type="number" step={step} value={value} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) set(v); }} /></label>
  );
  const p = org.params;
  return (
    <>
      <section className="f-card">
        <span className="field-label">Параметры (влияют на ABC, смету и цену договора — не на документы)</span>
        <div className="fgrid">
          {num('Месяцев', p.months, (v) => editOrg((o) => (o.params.months = v), 'p-m'))}
          {num('Взносы, %', Math.round(p.socialRate * 1000) / 10, (v) => editOrg((o) => (o.params.socialRate = v / 100), 'p-s'), 0.1)}
          {num('Накладные, %', Math.round(p.overheadRate * 1000) / 10, (v) => editOrg((o) => (o.params.overheadRate = v / 100), 'p-o'), 0.5)}
          {num('Маржа, %', Math.round(p.marginRate * 1000) / 10, (v) => editOrg((o) => (o.params.marginRate = v / 100), 'p-mg'), 0.5)}
          {num('Объектов', p.sites, (v) => editOrg((o) => (o.params.sites = v), 'p-si'))}
          {num('Обращений/мес', p.ticketsPerMonth, (v) => editOrg((o) => (o.params.ticketsPerMonth = v), 'p-t'), 10)}
          {num('Пользователей на объекте', p.usersPerSite, (v) => editOrg((o) => (o.params.usersPerSite = v), 'p-u'), 10)}
        </div>
        <p className="modal-text">
          Штат <b>{summary.totalFte}</b> ед. · ФОТ <b>{formatRub(summary.fotMonth)}</b>/мес ·{' '}
          <b>{formatRub(summary.fotYear)}</b>/год · цена обращения L1 <b>{formatRub(summary.ticketPrice)}</b>
        </p>
        <p className="modal-text">
          Себестоимость <b>{formatRub(contract.cost)}</b> + маржа <b>{formatRub(contract.margin)}</b> →{' '}
          <b>цена договора {formatRub(contract.priceYear)}/год</b> ({formatRub(contract.pricePerSiteMonth)}/объект/мес ·{' '}
          {formatRub(contract.pricePerUserMonth)}/пользователь/мес · {formatRub(contract.pricePerTicket)}/обращение)
        </p>
      </section>
      <section className="f-card">
        <span className="field-label">По подразделениям</span>
        <div className="table-wrap">
          <table className="zebra">
            <thead><tr><th>Подразделение</th><th className="num">Штат</th><th className="num">ФОТ/мес</th><th className="num">ФОТ/год</th></tr></thead>
            <tbody>
              {depFots(org).map((d) => (
                <tr key={d.dep.id}><td>{d.dep.name}</td><td className="num">{d.fte}</td><td className="num">{formatRub(d.fotMonth)}</td><td className="num">{formatRub(d.fotYear)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
