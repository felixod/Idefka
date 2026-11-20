// Шаблонатор DOCX: текстовый шаблон с {{тегами}} и {{ТАБЛИЦА:ИМЯ}} -> документ Word в браузере.
import {
  AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';

export interface DocTable {
  headers: string[];
  rows: string[][];
}

export interface DocContext {
  tags: Record<string, string>;
  tables: Record<string, DocTable>;
}

const BRAND = '004247';

function fill(text: string, tags: Record<string, string>): string[] {
  let out = text;
  for (const [tag, val] of Object.entries(tags)) out = out.replaceAll(`{{${tag}}}`, val);
  return out.split('\n');
}

function para(text: string, opts: { heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; center?: boolean; bold?: boolean } = {}): Paragraph {
  const runs = [new TextRun({ text, bold: opts.bold ?? false, size: 22 })];
  return new Paragraph({
    children: runs,
    heading: opts.heading,
    alignment: opts.center ? AlignmentType.CENTER : undefined,
    spacing: { after: 120 },
  });
}

function cell(text: string, bold = false): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold, size: 20 })] })],
    width: { size: Math.floor(100 / 4), type: WidthType.PERCENTAGE },
  });
}

function buildTable(t: DocTable): Table {
  const header = new TableRow({ children: t.headers.map((h) => cell(h, true)), tableHeader: true });
  const rows = t.rows.map((r) => new TableRow({ children: r.map((v) => cell(v)) }));
  return new Table({ rows: [header, ...rows], width: { size: 100, type: WidthType.PERCENTAGE } });
}

/** Разбирает шаблон и строит список блоков документа. */
export function renderTemplate(tpl: string, ctx: DocContext): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const raw of tpl.split('\n')) {
    const line = raw.trimEnd();
    const tableTag = line.match(/^\{\{ТАБЛИЦА:([А-ЯA-Z_]+)\}\}$/);
    if (tableTag) {
      const t = ctx.tables[tableTag[1]];
      if (t && t.rows.length) out.push(buildTable(t));
      else out.push(para(`[таблица «${tableTag[1]}» — нет данных]`));
      continue;
    }
    if (/^### /.test(line)) { out.push(para(fill(line.slice(4), ctx.tags)[0], { heading: HeadingLevel.HEADING_3, bold: true })); continue; }
    if (/^## /.test(line)) { out.push(para(fill(line.slice(3), ctx.tags)[0], { heading: HeadingLevel.HEADING_2, bold: true })); continue; }
    if (/^# /.test(line)) { out.push(para(fill(line.slice(2), ctx.tags)[0], { heading: HeadingLevel.HEADING_1, bold: true })); continue; }
    if (line === '') { out.push(para('')); continue; }
    for (const piece of fill(line, ctx.tags)) out.push(para(piece));
  }
  return out;
}

/** Строит DOCX (Uint8Array) из шаблона и контекста. */
export async function buildDocxBlob(tpl: string, ctx: DocContext): Promise<Uint8Array> {
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Times New Roman', size: 22 } },
        heading1: { run: { color: BRAND, bold: true, size: 32 } },
        heading2: { run: { color: BRAND, bold: true, size: 26 } },
      },
    },
    sections: [{ children: renderTemplate(tpl, ctx) }],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
