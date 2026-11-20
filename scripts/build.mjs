import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist');
const devMode = process.argv.includes('--serve');
const openBrowser = process.argv.includes('--open');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const config = {
  entryPoints: [path.join(root, 'src', 'main.tsx')],
  outfile: path.join(outDir, 'app.js'),
  bundle: true,
  minify: !devMode,
  sourcemap: devMode ? 'linked' : false,
  legalComments: 'none',
  logLevel: 'info',
  platform: 'browser',
  format: 'iife',
  target: ['chrome110', 'firefox115', 'safari16'],
  jsx: 'automatic',
  loader: { '.css': 'css' },
  alias: { buffer: 'buffer/' },
  define: {
    'process.env.NODE_ENV': JSON.stringify(devMode ? 'development' : 'production'),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
};

function prepareOutput() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.cpSync(path.join(root, 'public'), outDir, { recursive: true });
  fs.copyFileSync(path.join(root, 'src', 'index.html'), path.join(outDir, 'index.html'));
}

function cacheableFiles(dir, found = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) cacheableFiles(full, found);
    else if (!name.endsWith('.map') && name !== 'sw.js') found.push(path.relative(outDir, full).split(path.sep).join('/'));
  }
  return found;
}

// Имя кэша service worker зависит от содержимого сборки: после деплоя браузеры сами подтянут новую версию.
function contentVersion(files) {
  const hash = crypto.createHash('sha256');
  for (const file of files) hash.update(file).update(fs.readFileSync(path.join(outDir, file)));
  return pkg.version + '-' + hash.digest('hex').slice(0, 10);
}

function writeServiceWorker() {
  const files = cacheableFiles(outDir).sort();
  const version = contentVersion(files);
  const template = fs.readFileSync(path.join(root, 'src', 'sw.template.js'), 'utf8');
  const urls = JSON.stringify(['./', ...files.map((file) => './' + file)]);
  fs.writeFileSync(path.join(outDir, 'sw.js'), template.replace('__VERSION__', version).replace('__FILES__', urls));
  console.log(`  dist/sw.js  кэш ${version}, файлов: ${files.length}`);
}

function openInBrowser(url) {
  const commands = { win32: `start "" "${url}"`, darwin: `open "${url}"` };
  exec(commands[process.platform] ?? `xdg-open "${url}"`);
}

async function startDevServer() {
  const context = await esbuild.context(config);
  await context.watch();
  let port;
  try {
    ({ port } = await context.serve({ servedir: outDir, port: 5173 }));
  } catch {
    ({ port } = await context.serve({ servedir: outDir, port: 0 }));
  }
  const url = `http://localhost:${port}`;
  console.log(`\n  Idefka запущена: ${url}\n  Страница обновится сама после изменений в src/.\n  Чтобы остановить, закройте это окно или нажмите Ctrl+C.\n`);
  if (openBrowser) openInBrowser(url);
}

prepareOutput();
if (devMode) {
  await startDevServer();
} else {
  await esbuild.build(config);
  writeServiceWorker();
}
