import type { Model } from '../../model/types';
import { commit, useStore } from '../../store';
import { abcRows, formatMoney, type AbcRow } from '../../model/abc';
import { contractPrice, formatRub, orgOf, workFot } from '../../model/org';
import { uid } from '../../model/ops';
import { exportAbcCsv } from '../../actions';
import { Icon } from '../icons';

type AbcSettings = Model['abc'];
type CostCenter = AbcSettings['centers'][number];

const editAbc = (change: (abc: AbcSettings) => void, coalesceKey?: string) =>
  commit((draft) => {
    change(draft.abc);
  }, coalesceKey);

const renameCenter = (id: string, name: string) =>
  editAbc((abc) => {
    const center = abc.centers.find((c) => c.id === id);
    if (center) center.name = name;
  }, 'center-' + id);

const removeCenter = (id: string) =>
  editAbc((abc) => {
    abc.centers = abc.centers.filter((c) => c.id !== id);
  });

const addCenter = () =>
  editAbc((abc) => {
    abc.centers.push({ id: uid('c'), name: `Центр затрат ${abc.centers.length + 1}`, note: '' });
  });

function CostCenters({ abc }: { abc: AbcSettings }) {
  return (
    <section>
      <div className="field-label" style={{ marginBottom: 6 }}>
        Центры затрат
      </div>
      {abc.centers.map((center) => (
        <div key={center.id} className="center-row">
          <input value={center.name} placeholder="Например, «Зарплата»" onChange={(e) => renameCenter(center.id, e.target.value)} />
          <button className="tb-icon" aria-label="Удалить центр затрат" onClick={() => removeCenter(center.id)}>
            <Icon.trash />
          </button>
        </div>
      ))}
      <button className="btn" onClick={addCenter}>
        <Icon.plus />
        Добавить центр затрат
      </button>
      <div className="two-cols" style={{ marginTop: 14 }}>
        <label className="field">
          <span className="field-label">Валюта</span>
          <input value={abc.currency} onChange={(e) => editAbc((a) => (a.currency = e.target.value), 'currency')} />
        </label>
        <label className="field">
          <span className="field-label">Единица времени</span>
          <input value={abc.timeUnit} onChange={(e) => editAbc((a) => (a.timeUnit = e.target.value), 'timeunit')} />
        </label>
      </div>
      <label className="check" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={abc.show} onChange={(e) => editAbc((a) => (a.show = e.target.checked))} />
        Показывать стоимость на работах
      </label>
    </section>
  );
}

function ReportRow({ row, centers, currency }: { row: AbcRow; centers: CostCenter[]; currency: string }) {
  const { box, cost } = row;
  return (
    <tr className={cost.computed ? 'computed' : ''}>
      <td>{row.number}</td>
      <td style={{ paddingLeft: 8 + row.depth * 14 }}>{box.name}</td>
      <td className="num">{box.frequency ?? 1}</td>
      <td className="num">{Math.round(cost.duration * 100) / 100}</td>
      {centers.map((c) => (
        <td key={c.id} className="num">
          {formatMoney(cost.byCenter[c.id] ?? 0, '')}
        </td>
      ))}
      <td className="num">
        <b>{formatMoney(cost.total, currency)}</b>
      </td>
    </tr>
  );
}

function Report({ model }: { model: Model }) {
  const { centers, currency } = model.abc;
  return (
    <section className="abc-report">
      <div className="field-label" style={{ marginBottom: 6 }}>
        Отчёт по работам
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Номер</th>
              <th>Работа</th>
              <th className="num">Частота</th>
              <th className="num">Длит.</th>
              {centers.map((c) => (
                <th key={c.id} className="num">
                  {c.name}
                </th>
              ))}
              <th className="num">Итого</th>
            </tr>
          </thead>
          <tbody>
            {abcRows(model).map((row) => (
              <ReportRow key={row.box.id} row={row} centers={centers} currency={currency} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="field-hint">Строки с рассчитанной стоимостью (по декомпозиции) выделены. Значения у самих работ задаются в панели свойств справа.</p>
    </section>
  );
}

export function AbcDialog({ close }: { close: () => void }) {
  const { model } = useStore();
  const org = orgOf(model);
  const contract = org ? contractPrice(org) : null;

  // Ф4: оплату персонала из раздела org -> в стоимость работ по центру «Персонал»
  const syncSalaries = () =>
    commit((draft) => {
      if (!draft.org) return;
      let center = draft.abc.centers.find((c) => c.name === 'Персонал');
      if (!center) {
        const id = uid('c');
        draft.abc.centers.push({ id, name: 'Персонал', note: 'ФОТ из org (Ф4)' });
        center = draft.abc.centers[draft.abc.centers.length - 1];
      }
      const costs = workFot(draft.org!);
      for (const d of Object.values(draft.diagrams)) {
        for (const b of d.boxes) {
          if (b.costs) delete b.costs[center.id];
        }
      }
      for (const [wid, value] of costs) {
        for (const d of Object.values(draft.diagrams)) {
          const b = d.boxes.find((x) => x.id === wid);
          if (b) {
            b.costs = b.costs ?? {};
            b.costs[center.id] = Math.round(value * 100) / 100;
          }
        }
      }
      draft.abc.show = true;
    }, 'org-sync');

  return (
    <div className="abc-dialog">
      <h2>Стоимостной анализ (ABC) и деньги</h2>
      <p className="modal-text">
        Задайте центры затрат и стоимость недекомпозированных работ. Стоимость родительской работы считается сама: сумма дочерних работ × их частота.
      </p>
      {org && contract && (
        <section style={{ marginBottom: 12 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            Персонал и договор (из раздела org)
          </div>
          <div className="two-cols" style={{ gap: 10, marginBottom: 8 }}>
            <label className="field">
              <span className="field-label">Накладные, %</span>
              <input type="number" step={0.5} value={Math.round(org.params.overheadRate * 1000) / 10}
                onChange={(e) => commit((draft) => { if (draft.org) draft.org.params.overheadRate = Number(e.target.value) / 100; }, 'abc-oh')} />
            </label>
            <label className="field">
              <span className="field-label">Маржа, %</span>
              <input type="number" step={0.5} value={Math.round(org.params.marginRate * 1000) / 10}
                onChange={(e) => commit((draft) => { if (draft.org) draft.org.params.marginRate = Number(e.target.value) / 100; }, 'abc-mg')} />
            </label>
            <label className="field">
              <span className="field-label">Объектов</span>
              <input type="number" value={org.params.sites}
                onChange={(e) => commit((draft) => { if (draft.org) draft.org.params.sites = Number(e.target.value); }, 'abc-sites')} />
            </label>
          </div>
          <p className="modal-text">
            Себестоимость <b>{formatRub(contract.cost)}</b> + маржа <b>{formatRub(contract.margin)}</b> →{' '}
            <b>цена договора {formatRub(contract.priceYear)}/год</b> ({formatRub(contract.priceMonth)}/мес ·{' '}
            {formatRub(contract.pricePerSiteMonth)}/объект/мес · {formatRub(contract.pricePerUserMonth)}/пользователь/мес ·{' '}
            {formatRub(contract.pricePerTicket)}/обращение)
          </p>
          <button className="btn" onClick={syncSalaries}>
            <Icon.money />
            Синхронизировать: ФОТ персонала → в работы (центр «Персонал»)
          </button>
          <p className="field-hint">
            Записывает оплату персонала из org (формула Ф4) в стоимость работ; при изменении оргструктуры нажмите снова. Остальные центры затрат не затрагиваются.
          </p>
        </section>
      )}
      <div className="abc-grid">
        <CostCenters abc={model.abc} />
        <Report model={model} />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={exportAbcCsv}>
          <Icon.table />
          Сохранить отчёт (CSV для Excel)
        </button>
        <button className="btn primary" onClick={close}>
          Готово
        </button>
      </div>
    </div>
  );
}
