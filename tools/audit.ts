// CLI Модельного Аудита: кросс-нотационная согласованность .idef-моделей.
//
// Запуск из корня репозитория:
//   npx tsx tools/audit.ts <file.idef> [--json] [--md] [--out <report.ext>]
//
// Формат: по умолчанию — консольный отчёт; --json — машиночитаемый (CI);
// --md — человекочитаемый раздел для docs.
// Коды выхода: 0 — ERROR нет; 1 — есть ERROR; 2 — ошибка файла/аргументов.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseModel } from '../src/model/file';
import { runAudit, RULES_VERSION, REPORT_SCHEMA, type AuditReport, type Finding } from '../src/model/consistency';
import { validate } from '../src/model/validate';
import type { Model } from '../src/model/types';

interface CliOptions {
  file: string;
  json: boolean;
  md: boolean;
  out?: string;
}

function parseArgs(argv: string[]): CliOptions | null {
  const positional: string[] = [];
  const options: CliOptions = { file: '', json: false, md: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--md') options.md = true;
    else if (arg === '--out') options.out = argv[++i];
    else if (arg === '--help' || arg === '-h') return null;
    else positional.push(arg);
  }
  if (positional.length !== 1) return null;
  options.file = positional[0];
  return options;
}

const USAGE = 'Использование: npx tsx tools/audit.ts <file.idef> [--json] [--md] [--out <report.ext>]';

function toConsole(report: AuditReport, syntaxCount: number, fileName: string): string {
  const lines: string[] = [];
  const { error, warn, info, waived } = report.summary;
  lines.push(`Модельный аудит: ${fileName} (правила v${RULES_VERSION})`);
  lines.push(`Сводка: ERROR ${error} | WARN ${warn} | INFO ${info} | WAIVED ${waived} | синтаксис ${syntaxCount} | пройдено правил ${report.passes.length}/25`);
  lines.push('');
  for (const group of report.groups) {
    const failed = group.outcomes.filter((o) => o.findings.length);
    if (!failed.length) continue;
    lines.push(`${group.title} — ERROR ${group.error}, WARN ${group.warn}, INFO ${group.info}`);
    for (const outcome of failed) {
      lines.push(`  ${outcome.rule} [${outcome.level}] ${outcome.title} ×${outcome.findings.length}`);
      for (const f of outcome.findings) lines.push(`    - ${f.text}${f.diagramId ? ` (${f.diagramId}${f.boxId ? '#' + f.boxId : ''})` : ''}`);
    }
    lines.push('');
  }
  if (!report.findings.length) lines.push('Нарушений кросс-нотационной согласованности нет.');
  return lines.join('\n');
}

function toJson(report: AuditReport, model: Model, filePath: string, content: string, syntaxIssues: ReturnType<typeof validate>, fileName: string): string {
  return JSON.stringify(
    {
      schemaVersion: REPORT_SCHEMA,
      rulesVersion: RULES_VERSION,
      model: {
        file: fileName,
        meta: model.meta,
        diagrams: Object.keys(model.diagrams).length,
        hash: 'sha256:' + createHash('sha256').update(content, 'utf8').digest('hex'),
      },
      summary: {
        bySeverity: { error: report.summary.error, warn: report.summary.warn, info: report.summary.info, waived: report.summary.waived },
        byCategory: Object.fromEntries(report.groups.map((g) => [g.title, g.error + g.warn + g.info])),
        rulesFailed: new Set(report.findings.map((f) => f.rule)).size,
        rulesPassed: report.passes.length,
        rulesTotal: 25,
        syntaxIssues: syntaxIssues.length,
      },
      coverage: { leafWorks: report.coverage.leafWorks, byNotation: report.coverage.byNotation, matrix: report.coverage.rows },
      findings: report.findings.map((f, i) => ({
        id: `f-${String(i + 1).padStart(4, '0')}`,
        ruleId: f.rule,
        severity: f.level.toLowerCase(),
        message: f.text,
        element: { diagram: f.diagramId, box: f.boxId, arrow: f.arrowId },
        hint: f.hint ?? '',
        status: 'open',
      })),
      waived: report.waived.map((f: Finding, i: number) => ({ id: `w-${i + 1}`, ruleId: f.rule, message: f.text, status: 'waived' })),
      syntax: syntaxIssues.map((issue) => ({ diagram: issue.diagram, kind: issue.kind, id: issue.id, text: issue.text })),
      passes: report.passes,
    },
    null,
    2,
  );
}

function toMarkdown(report: AuditReport, syntaxCount: number, fileName: string, modelName: string): string {
  const { error, warn, info, waived } = report.summary;
  const lines: string[] = [];
  lines.push(`# Аудит модели «${modelName}»`);
  lines.push('');
  lines.push(`Файл: \`${fileName}\` · правила v${RULES_VERSION} (CR-01…CR-25) · синтаксических замечаний: ${syntaxCount}.`);
  lines.push('');
  lines.push('## Сводка');
  lines.push('');
  lines.push('| Уровень | Находок | Правил затронуто |');
  lines.push('|---|---:|---:|');
  const failedRules = new Set(report.findings.map((f) => f.rule));
  for (const [level, count] of [['ERROR', error], ['WARN', warn], ['INFO', info], ['WAIVED', waived]] as const) {
    const rules = level === 'WAIVED' ? new Set(report.waived.map((f) => f.rule)).size : [...failedRules].filter((r) => report.findings.find((f) => f.rule === r && f.level === level)).length;
    lines.push(`| ${level} | ${count} | ${rules} |`);
  }
  lines.push(`| **Итого** | **${error + warn + info}** | **${failedRules.size} из 25** |`);
  lines.push('');
  const cov = report.coverage;
  const pct = (n: number) => (cov.leafWorks ? Math.round((n / cov.leafWorks) * 100) : 0);
  lines.push(
    `Покрытие листовых работ (${cov.leafWorks}): процессные нотации ${cov.byNotation.anyProcess} (${pct(cov.byNotation.anyProcess)}%), DFD ${cov.byNotation.dfd} (${pct(cov.byNotation.dfd)}%), прецеденты ${cov.byNotation.uc} (${pct(cov.byNotation.uc)}%), оргроли ${cov.byNotation.org} (${pct(cov.byNotation.org)}%).`,
  );
  lines.push('');
  lines.push('## Находки');
  lines.push('');
  for (const group of report.groups) {
    const failed = group.outcomes.filter((o) => o.findings.length);
    if (!failed.length) continue;
    lines.push(`### ${group.title}`);
    lines.push('');
    for (const outcome of failed) {
      lines.push(`#### ${outcome.rule} [${outcome.level}] ${outcome.title} — ${outcome.findings.length}`);
      lines.push('');
      for (const f of outcome.findings) {
        lines.push(`- **${f.text}${f.diagramId ? ` (${f.diagramId})` : ''}**`);
        if (f.hint) lines.push(`  - 💡 ${f.hint}`);
      }
      lines.push('');
    }
  }
  lines.push('## Пройденные правила (зелёный каркас)');
  lines.push('');
  for (const pass of report.passes) lines.push(`- **${pass.rule}** ${pass.title} — ${pass.detail}`);
  lines.push('');
  return lines.join('\n');
}

function main(): number {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    console.error(USAGE);
    return 2;
  }
  let content: string;
  try {
    content = readFileSync(resolve(options.file), 'utf8');
  } catch (error) {
    console.error(`Не удалось прочитать файл «${options.file}»: ${error instanceof Error ? error.message : error}`);
    return 2;
  }
  let model: Model;
  try {
    model = parseModel(content);
  } catch (error) {
    console.error(`Файл не является моделью Idefka: ${error instanceof Error ? error.message : error}`);
    return 2;
  }

  const report = runAudit(model);
  const syntaxIssues = validate(model);
  const fileName = options.file.split(/[\\/]/).pop() ?? options.file;

  if (options.json) {
    const json = toJson(report, model, options.file, content, syntaxIssues, fileName);
    if (options.out) writeFileSync(resolve(options.out), json, 'utf8');
    else console.log(json);
  } else if (options.md) {
    const md = toMarkdown(report, syntaxIssues.length, fileName, model.meta.name);
    if (options.out) writeFileSync(resolve(options.out), md, 'utf8');
    else console.log(md);
  } else {
    console.log(toConsole(report, syntaxIssues.length, fileName));
    if (options.out) writeFileSync(resolve(options.out), toJson(report, model, options.file, content, syntaxIssues, fileName), 'utf8');
  }

  if (report.summary.error > 0) {
    console.error(`Аудит завершился с ошибками: ERROR ${report.summary.error} (см. правила выше).`);
    return 1;
  }
  return 0;
}

process.exit(main());
