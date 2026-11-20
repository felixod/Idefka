import { useState } from 'react';
import { useStore } from '../../store';
import { orgOf, roleFots } from '../../model/org';
import { exportOrgDocDocx } from '../../actions';

export function DocExport() {
  const { model } = useStore();
  const org = orgOf(model);
  const [depId, setDepId] = useState(org?.departments[0]?.id ?? '');
  const [roleId, setRoleId] = useState('');
  if (!org) return null;
  const roles = roleFots(org);

  return (
    <section style={{ marginBottom: 12 }}>
      <div className="field-label" style={{ marginBottom: 6 }}>
        Выгрузка в Word (DOCX) — по шаблонам
      </div>
      <div className="center-row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={depId} onChange={(e) => setDepId(e.target.value)} style={{ maxWidth: 260 }}>
          {org.departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <button className="btn" onClick={() => exportOrgDocDocx('polozhenie', depId)} disabled={!depId}>
          DOCX: Положение
        </button>
      </div>
      <div className="center-row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <select value={roleId} onChange={(e) => setRoleId(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="">— выберите должность —</option>
          {roles.map((r) => (
            <option key={r.role.id} value={r.role.id}>
              {r.role.name} ({r.dep.name})
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => exportOrgDocDocx('di', roleId)} disabled={!roleId}>
          DOCX: Должностная инструкция
        </button>
      </div>
      <p className="field-hint">
        Документ собирается в браузере по шаблону и данным модели (штат, функции с [A-узлами], KPI, вклад ₽ по Ф4).
      </p>
    </section>
  );
}
