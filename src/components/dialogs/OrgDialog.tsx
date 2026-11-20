import { useStore, commit } from '../../store';
import { depFots, formatRub, orgOf, orgSummary, roleFots, workIndex } from '../../model/org';
import { exportOrgCsv, exportOrgDocs } from '../../actions';
import { Icon } from '../icons';

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

export function OrgDialog({ close }: { close: () => void }) {
  const { model } = useStore();
  const org = orgOf(model);

  if (!org) {
    return (
      <div className="abc-dialog">
        <h2>Оргструктура и стоимость</h2>
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

  return (
    <div className="abc-dialog">
      <h2>Оргструктура и стоимость</h2>
      <p className="modal-text">
        Штат и ФОТ считаются из раздела org модели: оклад роли × FTE × {org.params.months} мес × (1 + взносы).
      </p>

      <div className="two-cols" style={{ gap: 10, marginBottom: 12 }}>
        {numField('Месяцев в году', org.params.months, (v) => editOrg((o) => (o.params.months = v), 'org-months'), 'months')}
        {numField('Взносы, %', Math.round(org.params.socialRate * 1000) / 10, (v) => editOrg((o) => (o.params.socialRate = v / 100), 'org-social'), 'social', 0.1)}
        {numField('Обращений/мес', org.params.ticketsPerMonth, (v) => editOrg((o) => (o.params.ticketsPerMonth = v), 'org-tickets'), 'tickets', 10)}
        {numField('Пользователей на объекте', org.params.usersPerSite, (v) => editOrg((o) => (o.params.usersPerSite = v), 'org-users'), 'users', 10)}
      </div>

      <section style={{ marginBottom: 12 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>
          Сводка
        </div>
        <p className="modal-text">
          Штат <b>{summary.totalFte}</b> ед. · ФОТ <b>{formatRub(summary.fotMonth)}</b>/мес ·{' '}
          <b>{formatRub(summary.fotYear)}</b>/год с взносами · цена обращения L1{' '}
          <b>{formatRub(summary.ticketPrice)}</b> · поддержка объекта{' '}
          <b>{formatRub(summary.costPerSiteYear)}</b>/год
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
        <p className="field-hint">
          Состав ролей и оклады хранятся в файле модели (поле org) — удобно менять генератором, файл остаётся совместимым с исходной Idefka.
        </p>
      </section>

      <div className="modal-actions">
        <button className="btn" onClick={exportOrgCsv}>
          <Icon.money />
          Смета ФОТ (CSV для Excel)
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
