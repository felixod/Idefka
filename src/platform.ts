interface FileHandle {
  name: string;
  kind: 'file';
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: unknown): Promise<void>; close(): Promise<void> }>;
  queryPermission?(options: { mode: string }): Promise<string>;
  requestPermission?(options: { mode: string }): Promise<string>;
}

interface RecentFile {
  name: string;
  handle: FileHandle;
  t: number;
}

interface OpenedFile {
  name: string;
  content: string;
}

const browser = window as unknown as {
  showOpenFilePicker?: (options: unknown) => Promise<FileHandle[]>;
  showSaveFilePicker?: (options: unknown) => Promise<FileHandle>;
  launchQueue?: { setConsumer(consumer: (params: { files: FileHandle[] }) => void): void };
};

// File System Access API есть только в Chromium: там Ctrl+S пишет прямо в открытый файл.
// В Firefox и Safari файл открывается через <input type="file">, а сохраняется скачиванием.
const hasFileAccess = typeof browser.showOpenFilePicker === 'function' && typeof browser.showSaveFilePicker === 'function';

const MODEL_TYPES = [{ description: 'Модель Idefka', accept: { 'application/json': ['.idef', '.json'] } }];
const RECENT_LIMIT = 8;

let currentHandle: FileHandle | null = null;

export function forgetFile() {
  currentHandle = null;
}

const cancelledByUser = (error: unknown) => (error as { name?: string })?.name === 'AbortError';

const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, ' ').trim();

function download(name: string, data: string | Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function ensureWritable(handle: FileHandle) {
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await handle.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

async function writeTo(handle: FileHandle, data: unknown) {
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function readHandle(handle: FileHandle): Promise<OpenedFile> {
  const file = await handle.getFile();
  currentHandle = handle;
  rememberRecent(handle).catch(() => undefined);
  return { name: file.name, content: await file.text() };
}

function pickWithInput(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.idef,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      currentHandle = null;
      resolve({ name: file.name, content: await file.text() });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

async function unlessCancelled<T>(action: () => Promise<T>): Promise<T | null> {
  try {
    return await action();
  } catch (error) {
    if (cancelledByUser(error)) return null;
    throw error;
  }
}

export async function openFileDialog(): Promise<OpenedFile | null> {
  if (!hasFileAccess) return pickWithInput();
  return unlessCancelled(async () => {
    const [handle] = await browser.showOpenFilePicker!({ types: MODEL_TYPES, multiple: false });
    return readHandle(handle);
  });
}

export async function saveModelFile(content: string, saveAs: boolean, suggestedName: string): Promise<string | null> {
  const name = `${safeFileName(suggestedName) || 'Модель'}.idef`;
  if (!hasFileAccess) {
    download(name, content, 'application/json');
    return name;
  }
  return unlessCancelled(async () => {
    if (!currentHandle || saveAs) currentHandle = await browser.showSaveFilePicker!({ suggestedName: name, types: MODEL_TYPES });
    if (!(await ensureWritable(currentHandle))) throw new Error('браузер не разрешил запись в файл. Сохраните через «Сохранить как…»');
    await writeTo(currentHandle, content);
    rememberRecent(currentHandle).catch(() => undefined);
    return currentHandle.name;
  });
}

export async function exportFile(suggestedName: string, data: string | Uint8Array, extension: string, label: string, mime: string) {
  const name = `${suggestedName}.${extension}`;
  if (!hasFileAccess) {
    download(name, data, mime);
    return name;
  }
  return unlessCancelled(async () => {
    const types = [{ description: label, accept: { [mime]: [`.${extension}`] } }];
    try {
      const handle = await browser.showSaveFilePicker!({ suggestedName: name, types });
      await writeTo(handle, data);
      return handle.name;
    } catch (error) {
      // встроенные контексты (вебвью, киоски) дают showSaveFilePicker, но блокируют запись —
      // в этом случае сохраняем обычной загрузкой
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
        download(name, data, mime);
        return name;
      }
      throw error;
    }
  });
}

export function printHtml(html: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  }, 250);
}

export function onLaunchFile(open: (file: OpenedFile) => void) {
  browser.launchQueue?.setConsumer(async ({ files }) => {
    if (files?.length) open(await readHandle(files[0]));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('cloneapp', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('recent');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rememberRecent(handle: FileHandle) {
  if (!hasFileAccess) return;
  const database = await openDatabase();
  const others = (await recentList()).filter((item) => item.name !== handle.name).slice(0, RECENT_LIMIT - 1);
  const transaction = database.transaction('recent', 'readwrite');
  transaction.objectStore('recent').put([{ name: handle.name, handle, t: Date.now() }, ...others], 'list');
  await new Promise((done) => (transaction.oncomplete = done));
}

export async function recentList(): Promise<RecentFile[]> {
  if (!hasFileAccess) return [];
  try {
    const database = await openDatabase();
    const request = database.transaction('recent', 'readonly').objectStore('recent').get('list');
    return await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function openRecent(name: string): Promise<OpenedFile | null> {
  const recent = (await recentList()).find((item) => item.name === name);
  if (!recent) return null;
  if (!(await ensureWritable(recent.handle))) return null;
  return readHandle(recent.handle);
}
