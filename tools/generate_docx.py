# -*- coding: utf-8 -*-
"""
Генератор документов Word (DOCX) по ШАБЛОНАМ + PDF-конвертация.

Шаблоны: tools/docgen/templates/Положение_template.docx, ДИ_template.docx.
Создаются автоматически при первом запуске — потом их можно править в Word
(шрифты, логотип, рамки): перегенерация подхватит ВАШ шаблон, теги {{...}} обязательны.

Выход: docs-org-docx/*.docx, и *.pdf если доступен конвертер (MS Word через docx2pdf/COM).
Запуск: python tools/generate_docx.py [--pdf]
"""
import io
import json
import os
import re
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from generate_org_docs import load, kpi_from_note, fmt  # noqa: E402

TEMPLATES = os.path.join(HERE, "docgen", "templates")
OUTDIR = os.path.join(ROOT, "docs-org-docx")
BRAND = RGBColor(0x00, 0x42, 0x47)
ORANGE = RGBColor(0xFF, 0x66, 0x00)

# ---------------------------------------------------------------- шаблоны
def _style_base(doc):
    st = doc.styles["Normal"]
    st.font.name = "Times New Roman"
    st.font.size = Pt(11)
    for name, size in (("Heading 1", 16), ("Heading 2", 13), ("Heading 3", 12)):
        h = doc.styles[name]
        h.font.name = "Times New Roman"
        h.font.size = Pt(size)
        h.font.bold = True
        h.font.color.rgb = BRAND

def _p(doc, text, style=None, bold=False, center=False):
    p = doc.add_paragraph(style=style)
    r = p.add_run(text)
    r.bold = bold
    if center:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    return p

def ensure_templates():
    os.makedirs(TEMPLATES, exist_ok=True)
    pos = os.path.join(TEMPLATES, "Положение_template.docx")
    if not os.path.exists(pos):
        doc = Document()
        _style_base(doc)
        _p(doc, "{{КОМПАНИЯ}}", bold=True, center=True)
        h = _p(doc, "Положение об отделе «{{ОТДЕЛ}}»", style="Heading 1", center=True)
        _p(doc, "утверждено приказом директора ИТ-компании · версия {{ВЕРСИЯ}}", center=True)
        doc.add_heading("1. Общие положения", level=2)
        doc.add_paragraph("{{ОБЩИЕ}}")
        doc.add_heading("2. Цели и задачи отдела", level=2)
        doc.add_paragraph("{{ЦЕЛИ}}")
        doc.add_heading("3. Структура и штатная численность", level=2)
        doc.add_paragraph("{{ШТАТ_ТАБЛИЦА}}")
        doc.add_paragraph("{{ШТАТ_ИТОГО}}")
        doc.add_heading("4. Функции отдела (из функциональной модели IDEF0)", level=2)
        doc.add_paragraph("{{ФУНКЦИИ}}")
        doc.add_heading("5. Показатели эффективности", level=2)
        doc.add_paragraph("{{KPI}}")
        doc.add_heading("6. Ресурсы и обеспечение", level=2)
        doc.add_paragraph("{{РЕСУРСЫ}}")
        doc.add_heading("7. Права и взаимодействие", level=2)
        doc.add_paragraph("{{ПРАВА}}")
        doc.add_paragraph("")
        _p(doc, "Утверждаю: ______________ Директор ИТ-компании", bold=False)
        _p(doc, "Руководитель отдела: ______________ / ____________________")
        doc.save(pos)
    di = os.path.join(TEMPLATES, "ДИ_template.docx")
    if not os.path.exists(di):
        doc = Document()
        _style_base(doc)
        _p(doc, "{{КОМПАНИЯ}}", bold=True, center=True)
        _p(doc, "ДОЛЖНОСТНАЯ ИНСТРУКЦИЯ", style="Heading 1", center=True)
        _p(doc, "{{ДОЛЖНОСТЬ}} — отдел «{{ОТДЕЛ}}»", center=True)
        doc.add_heading("1. Общие положения", level=2)
        doc.add_paragraph("{{ОБЩИЕ}}")
        doc.add_heading("2. Место в процессах (IDEF0) и обязанности", level=2)
        doc.add_paragraph("{{ПРОЦЕССЫ_ТАБЛИЦА}}")
        doc.add_heading("3. Показатели эффективности (KPI)", level=2)
        doc.add_paragraph("{{KPI}}")
        doc.add_heading("4. Требования к знаниям", level=2)
        doc.add_paragraph("{{ЗНАНИЯ}}")
        doc.add_heading("5. Ресурсное обеспечение роли", level=2)
        doc.add_paragraph("{{РЕСУРСЫ}}")
        doc.add_heading("6. Права и ответственность", level=2)
        doc.add_paragraph("{{ПРАВА}}")
        doc.add_paragraph("")
        _p(doc, "Условия оплаты — согласно штатному расписанию (грейд {{ГРЕЙД}}).")
        _p(doc, "Согласовано: ______________ Руководитель отдела")
        _p(doc, "Ознакомлен: ______________ / ____________________ (сотрудник)")
        doc.save(di)
    return pos, di

# ---------------------------------------------------------------- заполнение
def replace_tags(doc, mapping):
    def walk_paragraphs(document):
        for p in document.paragraphs:
            yield p
        for t in document.tables:
            for row in t.rows:
                for cell in row.cells:
                    for p in cell.paragraphs:
                        yield p
    for p in walk_paragraphs(doc):
        text = p.text
        if "{{" in text:
            for tag, val in mapping.items():
                text = text.replace("{{" + tag + "}}", val)
            # перезаписываем первый run, остальные чистим — сохраняет стиль шаблона
            if p.runs:
                p.runs[0].text = text
                for r in p.runs[1:]:
                    r.text = ""

def insert_table_after(doc, paragraph, headers, rows, widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = h
        for r in cell.paragraphs[0].runs:
            r.bold = True
    for row in rows:
        cells = table.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = str(v)
    paragraph._p.addnext(table._tbl)
    return table

def drop_paragraph(paragraph):
    paragraph._p.getparent().remove(paragraph._p)

def fill_tag_with_table(doc, tag, headers, rows):
    for p in list(doc.paragraphs):
        if "{{" + tag + "}}" in p.text:
            insert_table_after(doc, p, headers, rows)
            drop_paragraph(p)
            return True
    return False

# ---------------------------------------------------------------- контент
def main(make_pdf=False):
    pos_t, di_t = ensure_templates()
    model, org, works = load()
    p = org["params"]
    social = 1 + p["social_rate"]
    months = p["months"]
    os.makedirs(OUTDIR, exist_ok=True)
    roles = []
    for dep in org["departments"]:
        for r in dep["roles"]:
            avg = (r["salary_min"] + r["salary_max"]) / 2
            roles.append({**r, "dep": dep["name"], "dep_id": dep["id"],
                          "dep_kind": dep.get("kind", "internal"),
                          "dep_parent": dep.get("parent"),
                          "dep_goals": dep.get("goals", []),
                          "dep_mission": dep["mission"],
                          "reports_to": r.get("reports_to"),
                          "avg": avg, "fot_month": avg * r["fte"],
                          "fot_year": avg * r["fte"] * months * social})
    dep_fot = {}
    for dep in org["departments"]:
        dep_fot[dep["id"]] = sum(r["fot_year"] for r in roles if r["dep_id"] == dep["id"])
    total = sum(r["fot_year"] for r in roles)
    svc = sum(r["fot_year"] for r in roles if r["dep_kind"] == "service")
    by_rid = {r["id"]: r for r in roles}

    n_doc = 0
    # ---------------- Положения ----------------
    for dep in org["departments"]:
        dep_roles = [r for r in roles if r["dep_id"] == dep["id"]]
        parent = org["departments"] [[i for i, d in enumerate(org["departments"]) if d["id"] == dep["parent"]][0]]["name"] \
            if dep.get("parent") else "директору ИТ-компании (напрямую)"
        doc = Document(pos_t)
        tags = {
            "КОМПАНИЯ": org["company"], "ОТДЕЛ": dep["name"], "ВЕРСИЯ": "0.1 (из модели)",
            "ОБЩИЕ": f"1.1. Отдел «{dep['name']}» — структурное подразделение {org['company']}. "
                     f"Подчинение: {parent}. Тип: {dep.get('kind','internal')}.",
            "ЦЕЛИ": "\n".join(f"• {g}" for g in dep.get("goals", ["(заполнить)"]))
                     + f"\n\nМиссия: {dep['mission']}",
            "ШТАТ_ИТОГО": f"Итого штатных единиц: {sum(r['fte'] for r in dep_roles)}.",
            "РЕСУРСЫ": "Отдел обеспечивается персоналом согласно штатному расписанию, "
                       "инструментами и системами согласно каталогу сервисов. "
                       "Экономика отдела — в отчёте «Экономика» (ABC).",
            "ПРАВА": "Запрашивать информацию у смежных отделов и предприятий; приостанавливать "
                     "изменения вне CAB; эскалировать владельцу процесса.",
        }
        fill_tag_with_table(doc, "ШТАТ_ТАБЛИЦА",
            ["Роль", "Грейд", "FTE", "Подчиняется"],
            [[r["name"], r["grade"], r["fte"], f"{fmt(r['salary_min'])}–{fmt(r['salary_max'])}"]
             for r in dep_roles])
        dep_works = sorted({w for r in dep_roles for w in r["works"] if works.get(w)},
                           key=lambda wid: works[wid]["num"])
        fill_tag_with_table(doc, "ФУНКЦИИ",
            ["Узел", "Работа (IDEF0)", "Исполнители"],
            [[works[w]["num"], works[w]["name"],
              ", ".join(sorted({r["name"] for r in dep_roles if w in r["works"]}))]
             for w in dep_works])
        replace_tags(doc, tags)
        kpi_rows = []
        for wid in dep_works:
            for k in kpi_from_note(works[wid]["note"]):
                kpi_rows.append([works[wid]["num"], k])
        fill_tag_with_table(doc, "KPI", ["Узел", "Показатель"], kpi_rows or [["—", "(заполнить)"]])
        fname = os.path.join(OUTDIR, f"Положение_{dep['name'].replace(' ', '_')}.docx")
        doc.save(fname)
        n_doc += 1

    # ---------------- ДИ ----------------
    for r in roles:
        boss = by_rid.get(r["reports_to"])
        boss_txt = f"{boss['name']} ({boss['dep']})" if boss else "директор ИТ-компании"
        doc = Document(di_t)
        tags = {
            "КОМПАНИЯ": org["company"], "ДОЛЖНОСТЬ": r["name"], "ОТДЕЛ": r["dep"],
            "ГРЕЙД": r["grade"],
            "ОБЩИЕ": f"1.1. {r['name']} — специалист отдела «{r['dep']}», грейд {r['grade']}.\n"
                     f"1.2. Непосредственный руководитель: {boss_txt}.",
            "ЗНАНИЯ": "Профстандарт «Специалист по технической поддержке ИКС» (приказ Минтруда "
                      "№ 675н) — уровень грейда; ГОСТ Р ИСО/МЭК 14764 (категории сопровождения ПО); "
                      "регламенты процессов модели и БЗ своего домена.",
            "РЕСУРСЫ": "Инструменты и системы — согласно каталогу сервисов и БЗ домена; "
                      "условия оплаты — согласно штатному расписанию.",
            "ПРАВА": "Запрашивать данные и доступы; эскалировать блокеры; требовать актуальности "
                     "CMDB/БЗ в своей зоне. Ответственность: за нарушение регламентов и SLA, "
                     "за действия вне выданных доступов.",
        }
        rw = [w for w in r["works"] if works.get(w)]
        fill_tag_with_table(doc, "ПРОЦЕССЫ_ТАБЛИЦА",
            ["Узел", "Работа", "Обязанность"],
            [[works[w]["num"], works[w]["name"][:50],
              "исполнять по регламенту, соблюдать SLA"] for w in rw])
        kpi_rows = []
        for wid in rw:
            for k in kpi_from_note(works[wid]["note"]):
                kpi_rows.append([works[wid]["num"], k])
        fill_tag_with_table(doc, "KPI", ["Узел", "Показатель"], kpi_rows or [["—", "(заполнить)"]])
        replace_tags(doc, tags)
        safe = r["name"].replace(" ", "_").replace("/", "_")
        doc.save(os.path.join(OUTDIR, f"ДИ_{safe}.docx"))
        n_doc += 1

    print(f"OK: {n_doc} DOCX -> docs-org-docx/ (шаблоны: {TEMPLATES})")

    # ---------------- PDF (если есть конвертер) ----------------
    if make_pdf:
        try:
            from docx2pdf import convert  # requires MS Word on Windows
            for f in sorted(os.listdir(OUTDIR)):
                if f.endswith(".docx"):
                    convert(os.path.join(OUTDIR, f), os.path.join(OUTDIR, f[:-5] + ".pdf"))
            print("PDF: конвертировано через MS Word (docx2pdf)")
        except Exception as e:
            print(f"PDF: конвертер недоступен ({e.__class__.__name__}: {str(e)[:80]}). "
                  "DOCX готовы; для PDF откройте в Word → Сохранить как PDF.")

if __name__ == "__main__":
    main(make_pdf="--pdf" in sys.argv)