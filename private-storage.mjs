import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from './runtime.mjs';
const directories = new Set();
async function protect(target, directory) {
  const info = await fs.lstat(target);
  if (info.isSymbolicLink() || (!directory && (info.nlink !== 1 || !info.isFile()))) throw new Error('Refusing linked private storage');
  if (process.platform === 'win32') {
    await runProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./scripts/private-acl.ps1', import.meta.url)), '-Target', target], { timeout: 10000 });
  } else {
    if (info.uid !== process.getuid()) throw new Error('Private storage must belong to the current user');
    await fs.chmod(target, directory ? 0o700 : 0o600);
  }
}
export async function privateFile(directory, name, create = false) {
  directory = path.resolve(directory);
  if (!directories.has(directory)) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await protect(directory, true);
    directories.add(directory);
  }
  const file = path.join(directory, name);
  if (path.dirname(file) !== directory) throw new Error('Invalid private storage name');
  if (create) {
    try { await protect(file, false); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const handle = await fs.open(file, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | (constants.O_NOFOLLOW || 0), 0o600);
      await handle.close();
    }
  }
  try { await protect(file, false); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return file;
}
