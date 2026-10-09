#!/usr/bin/env node

import { lstatSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');

function inspectOutput(path) {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) throw new Error(`Refusing to clean symbolic link in dist: ${relative(root, path)}`);
  if (info.isDirectory()) {
    for (const entry of readdirSync(path)) inspectOutput(join(path, entry));
  } else if (!info.isFile()) {
    throw new Error(`Refusing to clean unsupported dist entry: ${relative(root, path)}`);
  } else if (info.nlink !== 1) {
    throw new Error(`Refusing to clean hard-linked dist file: ${relative(root, path)}`);
  }
}

try {
  const rootInfo = lstatSync(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error('Checkout root must be a real directory.');
  let outputInfo;
  try { outputInfo = lstatSync(output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (outputInfo) {
    if (outputInfo.isSymbolicLink() || !outputInfo.isDirectory()) throw new Error('dist must be a real directory before it can be cleaned.');
    inspectOutput(output);
    rmSync(output, { recursive: true });
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
