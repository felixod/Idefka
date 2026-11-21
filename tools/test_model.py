#!/usr/bin/env python3
"""Тонкая CI-обёртка над TS-CLI Модельного Аудита (tools/audit.ts).

Правила кросс-нотационной согласованности живут в TypeScript
(src/model/consistency.ts) и не дублируются на Python. Обёртка:

  1. находит node/npx и запускает «npx tsx tools/audit.ts <model> --json»;
  2. печатает человекочитаемую сводку (по уровням и правилам);
  3. пробрасывает код выхода CLI: 0 — ERROR нет, 1 — есть ERROR, 2 — ошибка файла.

Если node/npx недоступны (нет окружения Node) — деградирует до предупреждения:
кросс-проверки пропущены, выход 0 (приложение всё равно соберёт CI).

Запуск: python tools/test_model.py <model.idef> [--strict]
  --strict — падать также при наличии WARN.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def find_npx_command() -> list[str] | None:
    """npx в виде списка аргументов для subprocess (без shell)."""
    for name in ('npx', 'npx.cmd', 'npx.exe'):
        path = shutil.which(name)
        if path:
            # .cmd требует cmd.exe на Windows (subprocess без shell не запускает батники напрямую).
            return ['cmd', '/c', path] if path.lower().endswith(('.cmd', '.bat')) else [path]
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description='CI-обёртка Модельного Аудита')
    parser.add_argument('model', help='путь к .idef-модели (относительно корня репозитория или абсолютный)')
    parser.add_argument('--strict', action='store_true', help='считать WARN нарушением (exit 1)')
    args = parser.parse_args()

    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

    npx = find_npx_command()
    if not npx:
        print('WARN: node/npx не найдены — кросс-нотационный аудит пропущен (правила живут в TS).')
        return 0

    model_path = args.model if os.path.isabs(args.model) else os.path.join(os.getcwd(), args.model)
    cmd = npx + ['tsx', 'tools/audit.ts', model_path, '--json']
    proc = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')

    if proc.returncode == 2:
        print('ОШИБКА ФАЙЛА:', proc.stderr.strip() or proc.stdout.strip())
        return 2

    try:
        report = json.loads(proc.stdout)
    except json.JSONDecodeError:
        print('Не удалось разобрать JSON-отчёт CLI.')
        print('stdout:', proc.stdout[:2000])
        print('stderr:', proc.stderr[:2000])
        return 2

    severity = report['summary']['bySeverity']
    syntax_count = report['summary'].get('syntaxIssues', 0)
    print(f"Модель: {os.path.basename(model_path)}")
    print(
        'Сводка аудита: ERROR {error} | WARN {warn} | INFO {info} | WAIVED {waived} | '
        'синтаксис {syntax} | правил нарушено {failed}/25'.format(syntax=syntax_count, failed=report['summary']['rulesFailed'], **severity)
    )

    findings = report['findings']
    for finding in findings:
        mark = {'error': 'E', 'warn': 'W', 'info': 'I'}[finding['severity']]
        element = finding['element']
        place = element.get('diagram') or 'модель'
        print(f"  [{mark}] {finding['ruleId']}: {finding['message']} ({place})")

    if severity['error'] > 0:
        print(f"FAIL: {severity['error']} ошибок кросс-нотационной согласованности.")
        return 1
    if args.strict and severity['warn'] > 0:
        print(f"FAIL (--strict): {severity['warn']} предупреждений.")
        return 1
    print('OK: ошибок кросс-нотационной согласованности нет.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
