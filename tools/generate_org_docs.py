# -*- coding: utf-8 -*-
"""
Генератор оргдокументов и прогноза стоимости из IDEF0-модели (.idef) + справочника оргструктуры.

Выход (каталог docs-org/):
  Положение_<Отдел>.md          — положение об отделе/управлении
  ДИ_<Роль>.md                  — должностная инструкция
  Прогноз_стоимости.md          — ФОТ по отделам, стоимость работ, цена обращения, стоимость на объект

Логика распределения затрат: годовой ФОТ роли (с взносами) делится поровну между
работами, к которым роль приписана. Стоимость работы = сумма долей всех её ролей.
"""
import json
import os
import re

IDEF = "IT-operating-model.idef"
ORG = "tools/org_structure.json"
OUT = "docs-org"

def fmt(v):
    return f"{v:,.0f}".replace(",", " ")

def load():
    with open(IDEF, encoding="utf-8") as f:
        model = json.load(f)
    with open(ORG, encoding="utf-8") as f:
        org = json.load(f)
    # индекс работ: id -> (номер A-узла, название, примечание)
    works = {}
    def number_of(diagram_id, box_id):
        # каноническая нумерация Idefka (boxNumber, query.ts):
        # индекс среди activity-работ СВОЕЙ диаграммы + номер родительской работы
        d = model["diagrams"][diagram_id]
        numbered = [b for b in d["boxes"] if b.get("kind", "activity") == "activity"]
        idx = next(i for i, b in enumerate(numbered) if b["id"] == box_id) + 1
        parent = d.get("parent")
        if not parent:
            return "A0"
        pnum = number_of(parent["diagram"], parent["box"])
        return f"A{idx}" if pnum == "A0" else f"{pnum}{idx}"

    for did, d in model["diagrams"].items():
        if d.get("notation") != "idef0":
            continue
        parent_box = d.get("parent", {}).get("box")
        pboxes = model["diagrams"][d["parent"]["diagram"]]["boxes"] if d.get("parent") else []
        for b in d["boxes"]:
            if b.get("kind", "activity") != "activity":
                continue
            num = number_of(did, b["id"]) if d.get("parent") else "A0"
            works[b["id"]] = {"num": num, "name": b["name"].replace("\n", " "),
                              "note": (b.get("note") or "").strip(), "diagram": did}
    return model, org, works

def kpi_from_note(note):
    """Достаёт фрагменты с KPI (содержат >=, <=, %, цифры со словами)."""
    if not note:
        return []
    parts = re.split(r"(?<=[.;])\s+", note)
    return [p.strip(" .;") for p in parts if re.search(r"\d+\s*%|>=|<=|>= ?\d", p)]

def main():
    model, org, works = load()
    os.makedirs(OUT, exist_ok=True)
    p = org["params"]
    social = 1 + p["social_rate"]
    months = p["months"]

    # ---- расчёт ФОТ ----
    roles = []
    for dep in org["departments"]:
        for r in dep["roles"]:
            avg = (r["salary_min"] + r["salary_max"]) / 2
            fot_month = avg * r["fte"]
            roles.append({**r, "dep": dep["name"], "dep_id": dep["id"], "dep_mission": dep["mission"],
                          "dep_kind": dep.get("kind", "internal"), "dep_parent": dep.get("parent"),
                          "dep_goals": dep.get("goals", []), "reports_to": r.get("reports_to"),
                          "avg": avg, "fot_month": fot_month,
                          "fot_year": fot_month * months * social})

    # ---- Положения об отделах ----
    for dep in org["departments"]:
        dep_roles = [r for r in roles if r["dep_id"] == dep["id"]]
        dep_works = {}
        for r in dep_roles:
            for wid in r["works"]:
                dep_works.setdefault(wid, []).append(r["name"])
        lines = [
            f"# Положение об отделе «{dep['name']}»",
            "",
            f"**{org['company']}** · версия 0.1 (черновик, сгенерировано из IDEF0-модели {os.path.basename(IDEF)})",
            "",
            "## 1. Общие положения",
            f"1.1. Отдел «{dep['name']}» является структурным подразделением {org['company']}.",
            "1.2. Отдел подчиняется непосредственно директору ИТ-компании.",
            "1.3. Отдел руководствуется регламентами процессов (RACI), каталогом услуг и SLA/OLA, "
            "настоящим положением.",
            "",
            "## 2. Назначение и задачи",
            f"2.1. {dep['mission']}",
            "",
            "## 3. Структура и штатная численность",
            "",
            "| Роль | Грейд | Штатных единиц |",
            "|---|---|---|",
        ]
        for r in dep_roles:
            lines.append(f"| {r['name']} | {r['grade']} | {r['fte']} |")
        lines += ["", f"**Итого штатных единиц:** {sum(r['fte'] for r in dep_roles)}", "",
                  "## 4. Функции отдела (из функциональной модели)", ""]
        for wid, rnames in sorted(dep_works.items(), key=lambda kv: works[kv[0]]["num"]):
            w = works[wid]
            lines.append(f"### {w['num']}. {w['name']}")
            if w["note"]:
                lines.append(f"*{w['note']}*")
            lines.append(f"Исполнители: {', '.join(sorted(set(rnames)))}.")
            lines.append("")
        lines += [
            "## 5. Права",
            "5.1. Отдел вправе запрашивать у предприятий и смежных подразделений информацию, необходимую для исполнения функций.",
            "5.2. Приостанавливать изменения, не прошедшие CAB, в части, касающейся зоны ответственности отдела.",
            "",
            "## 6. Взаимодействие",
            "6.1. С предприятиями Компании — через BRM и сервис-деск (единая точка входа).",
            "6.2. Со смежными отделами — по процессам IDEF0-модели (стрелки-потоки).",
            "",
            "## 7. Показатели эффективности отдела",
            "",
        ]
        kpis = set()
        for wid in dep_works:
            for k in kpi_from_note(works[wid]["note"]):
                kpis.add(f"{works[wid]['num']}: {k}")
        lines += [f"- {k}" for k in sorted(kpis)] or ["- (заполняется владельцем процесса)"]
        fname = os.path.join(OUT, f"Положение_{dep['name'].replace(' ', '_')}.md")
        with open(fname, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

    # ---- Должностные инструкции ----
    for r in roles:
        lines = [
            f"# Должностная инструкция — {r['name']}",
            "",
            f"**{org['company']} · {r['dep']}** · грейд {r['grade']} · версия 0.1 (черновик из IDEF0-модели)",
            "",
            "## 1. Общие положения",
            f"1.1. {r['name']} относится к категории специалистов отдела «{r['dep']}».",
            f"1.2. Назначается и освобождается от должности приказом директора по представлению руководителя отдела.",
            f"1.3. В подчинении: {'нет' if 'руководитель' not in r['name'].lower() else 'сотрудники отдела согласно штатному расписанию'}.",
            "",
            f"## 2. Место в процессах (IDEF0)",
            "",
        ]
        for wid in r["works"]:
            w = works[wid]
            lines.append(f"- **{w['num']}. {w['name']}**" + (f" — {w['note']}" if w["note"] else ""))
        lines += ["", "## 3. Должностные обязанности", ""]
        for wid in r["works"]:
            w = works[wid]
            verb = w["name"][0].lower() + w["name"][1:]
            lines.append(f"3.{r['works'].index(wid)+1}. {verb[0].upper() + verb[1:]} в рамках работы {w['num']}; "
                         f"соблюдение регламентов процесса и SLA.")
        lines += [
            "",
            "## 4. Показатели эффективности (KPI)",
            "",
        ]
        kpis = []
        for wid in r["works"]:
            for k in kpi_from_note(works[wid]["note"]):
                kpis.append(f"- {works[wid]['num']}: {k}")
        lines += kpis or ["- (заполняется руководителем)"]
        lines += [
            "",
            "## 4.1. Требования к знаниям",
            "- Профстандарт «Специалист по технической поддержке ИКС» (приказ Минтруда "
            f"№ 675н): знания/умения уровня грейда {r['grade']}.",
            "- ГОСТ Р ИСО/МЭК 14764 — категории сопровождения ПО (для задач сопровождения).",
            "- Регламенты процессов IDEF0-модели и статьи БЗ своего домена.",
            "",
            "## 4.2. Ресурсное обеспечение роли",
            "Инструменты и системы — согласно каталогу сервисов и БЗ домена; условия оплаты — согласно штатному расписанию.",
            "## 5. Права",
            "5.1. Запрашивать информацию и доступы, необходимые для исполнения обязанностей.",
            "5.2. Эскалировать блокеры по процессам владельцу процесса.",
            "5.3. Требовать актуальности KB и CMDB для своей зоны.",
            "",
            "## 6. Ответственность",
            "6.1. За неисполнение регламентов процессов и нарушение SLA.",
            "6.2. За действия в информационных системах вне granted-доступов.",
            "",
            "## 7. Оплата",
            "Условия оплаты — согласно штатному расписанию.",
        ]
        fname = os.path.join(OUT, f"ДИ_{r['name'].replace(' ', '_').replace('/', '_')}.md")
        with open(fname, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

    # Экономика — отдельный отчёт (Экономика.md); в оргдокументах денег нет

    n_pos = len(org["departments"])
    n_di = len(roles)
    print(f"OK: {n_pos} положений, {n_di} должностных инструкций, прогноз стоимости -> {OUT}/")

if __name__ == "__main__":
    main()
