// Мастер структуры: 4 шага → предпросмотр каркаса → диф-применение к org.
// Методология: docs-analysis/Мастер_оргструктуры_методология.md (упрощённое ядро:
// гибридная департаментализация A1–A6 + филиалы, нормативы численности, 24/7).
import { useMemo, useState } from 'react';
import { commit, useStore } from '../store';
import { createDepartment, depForWork, orgOf, workIndex, DEP_KIND_TITLE } from '../model/org';
import { Icon } from './icons';
import type { OrgData, OrgDepartment, OrgRole } from '../model/types';

interface Answers {
  basis: 'process' | 'hybrid';
  sites: number;
  clusters: number;
  usersPerSite: number;
  ticketsPerUser: number;
  continuous: boolean;
  usersPerL1: number;
  l1ToL2: number;
  fieldRatio: number; // 1 эникей на N пользователей
  span: number;
}

const DEFAULTS: Answers = {
  basis: 'hybrid',
  sites: 28,
  clusters: 7,
  usersPerSite: 350,
  ticketsPerUser: 0.8,
  continuous: true,
  usersPerL1: 700,
  l1ToL2: 3,
  fieldRatio: 450,
  span: 9,
};

interface PlanRole {
  dep: string;
  name: string;
  grade: string;
  fte: number;
  note: string;
}

interface Plan {
  departments: Array<{ id: string; name: string; kind: OrgDepartment['kind']; parent?: string; reason: string }>;
  roles: PlanRole[];
  params: Partial<OrgData['params']>;
}

function planFrom(a: Answers): Plan {
  const users = a.sites * a.usersPerSite;
  const l1 = Math.max(4, Math.ceil(users / a.usersPerL1) + (a.continuous ? 4 : 0));
  const l2 = Math.max(2, Math.ceil(l1 / a.l1ToL2));
  const field = Math.max(1, Math.ceil(users / a.fieldRatio));
  const filRoles = Math.max(1, Math.ceil(a.sites / a.clusters));
  const departments: Plan['departments'] = [
    { id: 'HQ', name: 'Дирекция ИТ-компании', kind: 'internal', reason: 'корень' },
    { id: 'OPS', name: 'Дирекция ИТ-эксплуатации', kind: 'internal', parent: 'HQ', reason: 'эксплуатация (Минцберг: mechanistic ядро)' },
    { id: 'SD', name: 'Служба сервис-деска (L1)', kind: 'service', parent: 'OPS', reason: 'A1: единая точка входа' },
    { id: 'FIELD', name: 'Полевая служба (зоны)', kind: 'service', parent: 'OPS', reason: 'A13: руки на местах' },
    { id: 'INFRA', name: 'Управление ИТ-инфраструктуры', kind: 'service', parent: 'OPS', reason: 'A2: домены' },
    { id: 'DEV', name: 'Дирекция ИТ-развития', kind: 'internal', parent: 'HQ', reason: 'organic-часть (развитие)' },
    { id: 'DEVOPS', name: 'Отдел DevOps и платформы', kind: 'development', parent: 'DEV', reason: 'A3' },
    { id: 'IMPL', name: 'Управление внедрения', kind: 'development', parent: 'DEV', reason: 'A6' },
    { id: 'SUP', name: 'Дирекция обеспечения', kind: 'internal', parent: 'HQ', reason: 'A4+A5' },
    { id: 'KNOW', name: 'Отдел знаний и развития персонала', kind: 'internal', parent: 'SUP', reason: 'A4' },
    { id: 'FIN', name: 'Отдел ИТ-финансов', kind: 'internal', parent: 'SUP', reason: 'A5' },
  ];
  if (a.basis === 'hybrid') {
    departments.push({ id: 'FIL', name: `Филиальная сеть (${a.clusters} кластеров)`, kind: 'service', parent: 'OPS', reason: `география: ${a.clusters} кластеров на ${a.sites} объектов` });
  }
  const roles: PlanRole[] = [
    { dep: 'HQ', name: 'Директор ИТ-компании', grade: 'Lead', fte: 1, note: 'вершина, span ≤ ' + a.span },
    { dep: 'OPS', name: 'Директор по эксплуатации', grade: 'Lead', fte: 1, note: 'руководитель эксплуатационного ядра' },
    { dep: 'SD', name: 'Аналитик сервис-деска (L1)', grade: 'Middle', fte: l1, note: `${users} польз. / ${a.usersPerL1}${a.continuous ? ' + 4 ставки 24/7' : ''}` },
    { dep: 'SD', name: 'Руководитель смены сервис-деска', grade: 'Senior', fte: Math.max(2, Math.ceil(l1 / a.span / 2)), note: 'span ' + a.span },
    { dep: 'INFRA', name: 'L2-инженер домена', grade: 'Senior', fte: l2, note: `L1:L2 ≈ ${a.l1ToL2}:1` },
    { dep: 'INFRA', name: 'Инженер надёжности (NOC 24/7)', grade: 'Middle', fte: a.continuous ? 10 : 4, note: a.continuous ? '2 стула × 5 ставок (ТК РФ)' : 'мониторинг' },
    { dep: 'FIELD', name: 'Полевой инженер зоны (эникей)', grade: 'Middle', fte: field, note: `1:${a.fieldRatio} пользователей` },
    { dep: 'DEV', name: 'Директор по развитию', grade: 'Lead', fte: 1, note: '' },
    { dep: 'DEVOPS', name: 'DevOps-инженер платформы', grade: 'Senior', fte: 3, note: 'A3: платформа' },
    { dep: 'IMPL', name: 'Инженер команды внедрения', grade: 'Middle', fte: 4, note: 'A6: конвейер' },
    { dep: 'SUP', name: 'Директор по обеспечению', grade: 'Lead', fte: 1, note: '' },
    { dep: 'KNOW', name: 'Технический писатель', grade: 'Middle', fte: 2, note: 'A4: KB/CMDB' },
    { dep: 'FIN', name: 'FinOps-аналитик', grade: 'Senior', fte: 2, note: 'A5' },
  ];
  if (a.basis === 'hybrid') {
    roles.push(
      { dep: 'FIL', name: 'Руководитель филиала', grade: 'Lead', fte: a.clusters, note: 'по 1 на кластер' },
      { dep: 'FIL', name: 'Эникей embedded на объекте', grade: 'Middle', fte: a.sites, note: '1 на объект' },
      { dep: 'FIL', name: 'Координатор объектов', grade: 'Junior', fte: filRoles * 2, note: 'логистика допусков' },
    );
  }
  return {
    departments,
    roles,
    params: {
      sites: a.sites,
      usersPerSite: a.usersPerSite,
      ticketsPerMonth: Math.round(users * a.ticketsPerUser),
    },
  };
}

const STEPS = ['Основа', 'Масштаб', 'Нормативы', 'Применение'] as const;

function Num({ label, value, set, step = 1, min = 0 }: { label: string; value: number; set: (v: number) => void; step?: number; min?: number }) {
  return (
    <label className="f-field">
      <span className="field-label">{label}</span>
      <input type="number" step={step} min={min} value={value} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= min) set(v); }} />
    </label>
  );
}

export function OrgWizard({ close }: { close: () => void }) {
  const { model } = useStore();
  const org = orgOf(model);
  const works = useMemo(() => workIndex(model), [model]);
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>(DEFAULTS);
  const plan = useMemo(() => planFrom(a), [a]);
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((prev) => ({ ...prev, [k]: v }));

  const existing = new Set(org?.departments.map((d) => d.id) ?? []);
  const newDeps = plan.departments.filter((d) => !existing.has(d.id));
  const totalFte = plan.roles.reduce((s, r) => s + r.fte, 0);

  const apply = () => {
    commit((draft) => {
      if (!draft.org) draft.org = { departments: [], params: { months: 12, socialRate: 0.302, overheadRate: 0.25, marginRate: 0.15, ticketsPerMonth: 1500, usersPerSite: 350, ticketsPerUserPerMonth: 0.8, sites: 8 } };
      const o = draft.org;
      Object.assign(o.params, plan.params);
      for (const d of plan.departments) {
        if (!o.departments.some((x) => x.id === d.id)) {
          createDepartment(o, d.name, d.kind, d.parent);
          // createDepartment генерит случайный id — исправим на стабильный
          const created = o.departments[o.departments.length - 1];
          created.id = d.id;
        }
      }
      // распределение работ по отделам (A1..A6 → DEP_BY_AREA)
      for (const [wid, w] of works) {
        if (wid === 'a0') continue;
        const depId = depForWork(w.num);
        if (!o.departments.some((d) => d.id === depId)) continue;
        const dep = o.departments.find((d) => d.id === depId)!;
        const covered = dep.roles.some((r) => (r.works ?? []).includes(wid));
        if (!covered) {
          const target = dep.roles.find((r) => plan.roles.some((pr) => pr.dep === depId && pr.name === r.name));
          if (target) target.works = [...(target.works ?? []), wid];
        }
      }
      // роли: создать отсутствующих (по имени внутри отдела), существующим НЕ менять FTE
      for (const pr of plan.roles) {
        const dep = o.departments.find((d) => d.id === pr.dep);
        if (!dep) continue;
        if (!dep.roles.some((r) => r.name === pr.name)) {
          const role: OrgRole = { id: 'w' + Math.random().toString(36).slice(2, 8), name: pr.name, grade: pr.grade, salaryMin: 80000, salaryMax: 140000, fte: pr.fte, works: [], note: 'мастер: ' + pr.note };
          dep.roles.push(role);
        }
      }
    }, 'wizard-apply');
    close();
  };

  return (
    <div className="org-wizard">
      <div className="org-ws-head">
        <b>Мастер структуры</b>
        <span className="muted">{STEPS[step]} · шаг {step + 1}/4</span>
        <span style={{ flex: 1 }} />
        <button className="btn primary" onClick={close}>Закрыть</button>
      </div>
      <div className="org-wizard-body">
        <div className="seg" style={{ marginBottom: 14 }}>
          {STEPS.map((s, i) => (
            <button key={s} className={step === i ? 'on' : ''} onClick={() => setStep(i)}>{i + 1}. {s}</button>
          ))}
        </div>

        {step === 0 && (
          <section className="f-card">
            <span className="field-label">Основа организационного дизайна</span>
            <div className="seg" style={{ marginBottom: 12 }}>
              <button className={a.basis === 'process' ? 'on' : ''} onClick={() => set('basis', 'process')}>Только центр (по процессам A1–A6)</button>
              <button className={a.basis === 'hybrid' ? 'on' : ''} onClick={() => set('basis', 'hybrid')}>Гибрид: центр + филиальная сеть</button>
            </div>
            <label className="f-field" style={{ maxWidth: 320 }}>
              <span className="field-label">Режим объектов</span>
              <select value={a.continuous ? '1' : '0'} onChange={(e) => set('continuous', e.target.value === '1')}>
                <option value="1">Есть непрерывные производства (24/7)</option>
                <option value="0">Все объекты 5×8</option>
              </select>
            </label>
            <p className="card-hint">Гибрид = дивизиональная форма с процессным ядром (Минцберг): эксплуатация — mechanistic, развитие — organic. Работы IDEF0 распределятся по отделам автоматически.</p>
          </section>
        )}

        {step === 1 && (
          <section className="f-card">
            <span className="field-label">Масштаб и спрос</span>
            <div className="fgrid">
              <Num label="Объектов" value={a.sites} set={(v) => set('sites', v)} />
              <Num label="Кластеров (филиалов)" value={a.clusters} set={(v) => set('clusters', v)} min={1} />
              <Num label="Пользователей на объекте" value={a.usersPerSite} set={(v) => set('usersPerSite', v)} step={10} />
              <Num label="Обращений/пользователя в месяц" value={a.ticketsPerUser} set={(v) => set('ticketsPerUser', v)} step={0.1} />
            </div>
            <p className="modal-text">Итого пользователей: <b>{(a.sites * a.usersPerSite).toLocaleString('ru-RU')}</b> · обращений/мес ≈ <b>{Math.round(a.sites * a.usersPerSite * a.ticketsPerUser).toLocaleString('ru-RU')}</b></p>
          </section>
        )}

        {step === 2 && (
          <section className="f-card">
            <span className="field-label">Нормативы численности (MetricNet/HDI/ТК РФ)</span>
            <div className="fgrid">
              <Num label="Пользователей на 1 L1" value={a.usersPerL1} set={(v) => set('usersPerL1', v)} step={50} />
              <Num label="L1 : L2 (1 : N)" value={a.l1ToL2} set={(v) => set('l1ToL2', v)} min={1} />
              <Num label="Пользователей на 1 эникея" value={a.fieldRatio} set={(v) => set('fieldRatio', v)} step={50} />
              <Num label="Норма управляемости (span)" value={a.span} set={(v) => set('span', v)} min={3} />
            </div>
            <p className="card-hint">Пользователей на L1: 650–750 при 24/7 (MetricNet); эникей embedded 1:350–500; NOC 24/7 = 2 стула × 5 ставок (ТК РФ).</p>
          </section>
        )}

        {step === 3 && (
          <section className="f-card">
            <span className="field-label">
              Предпросмотр: каркас ({newDeps.length ? `${newDeps.length} новых подразделений, ` : 'все подразделения уже есть, '}
              FTE плана ≈ {totalFte})
            </span>
            <table className="zebra table-wrap" style={{ maxHeight: '40vh' }}>
              <thead><tr><th>Подразделение</th><th>Тип</th><th>Роль</th><th className="num">FTE</th><th>Обоснование</th></tr></thead>
              <tbody>
                {plan.departments.map((d) => (
                  <tr key={d.id} className={!existing.has(d.id) ? 'org-new' : ''}>
                    <td>{existing.has(d.id) ? d.name : <b>+ {d.name}</b>}</td>
                    <td>{DEP_KIND_TITLE[d.kind]}</td>
                    <td />
                    <td className="num" />
                    <td>{d.reason}</td>
                  </tr>
                ))}
                {plan.roles.map((r, i) => (
                  <tr key={r.name + i}>
                    <td colSpan={2} />
                    <td>{r.name}</td>
                    <td className="num">{r.fte}</td>
                    <td className="muted">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="card-hint">Применение — дифференциальное: создаются только отсутствующие подразделения и роли; существующие роли и FTE не перезаписываются; работы IDEF0 доцепляются непокрытым ролям по областям A1–A6.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn primary" onClick={apply}><Icon.check /> Применить к модели</button>
            </div>
          </section>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>← Назад</button>
          <button className="btn" disabled={step === 3} onClick={() => setStep(step + 1)}>Далее →</button>
        </div>
      </div>
    </div>
  );
}
