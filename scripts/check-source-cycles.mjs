#!/usr/bin/env node

import { lstat, readFile, realpath, readdir } from 'node:fs/promises';
import { parse } from 'acorn';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultSourceRoot = path.resolve(scriptDirectory, '../src');

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function displayPath(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

async function findSourceFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symbolic link is not supported in source root: ${displayPath(root, absolute)}`);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        if (/\.(?:js|cjs|jsx|ts|tsx|mts|cts)$/i.test(entry.name)) {
          throw new Error(`unsupported source file extension (checker covers .mjs only): ${displayPath(root, absolute)}`);
        }
        if (entry.name.endsWith('.mjs')) files.push(absolute);
      }
    }
  }
  await visit(root);
  return files.sort((a, b) => compareText(displayPath(root, a), displayPath(root, b)));
}

async function assertNoSymlinkComponents(root, target) {
  const relative = path.relative(root, target);
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const info = await lstat(current).catch(error => {
      if (error.code === 'ENOENT') throw new Error(`missing relative .mjs import target: ${displayPath(root, target)}`);
      throw error;
    });
    if (info.isSymbolicLink()) throw new Error(`symbolic link is not supported in relative import target: ${displayPath(root, current)}`);
  }
}

async function resolveRelativeImport(root, importer, specifier) {
  if (!(specifier.startsWith('./') || specifier.startsWith('../'))) return null;
  if (!specifier.endsWith('.mjs')) {
    throw new Error(`unsupported relative import target from ${displayPath(root, importer)}: ${specifier} (only .mjs targets are checked)`);
  }
  const target = path.resolve(path.dirname(importer), specifier);
  if (!isWithin(root, target)) throw new Error(`relative import escapes source root from ${displayPath(root, importer)}: ${specifier}`);
  await assertNoSymlinkComponents(root, target);
  const info = await lstat(target);
  if (!info.isFile()) throw new Error(`relative import target is not a regular file: ${displayPath(root, target)}`);
  const resolved = await realpath(target);
  if (!isWithin(root, resolved)) throw new Error(`relative import escapes source root from ${displayPath(root, importer)}: ${specifier}`);
  return resolved;
}

function normalizeCycle(cycle) {
  const ring = cycle.slice(0, -1);
  let best = ring;
  for (let index = 1; index < ring.length; index += 1) {
    const rotated = [...ring.slice(index), ...ring.slice(0, index)];
    if (compareText(rotated.join('\0'), best.join('\0')) < 0) best = rotated;
  }
  return [...best, best[0]];
}

function findCycles(graph) {
  const state = new Map();
  const stack = [];
  const found = new Map();
  function visit(module) {
    state.set(module, 1);
    stack.push(module);
    for (const dependency of graph.get(module) ?? []) {
      if (state.get(dependency) === 1) {
        const start = stack.lastIndexOf(dependency);
        const cycle = normalizeCycle([...stack.slice(start), dependency]);
        found.set(cycle.join('\0'), cycle);
      } else if (!state.has(dependency)) {
        visit(dependency);
      }
    }
    stack.pop();
    state.set(module, 2);
  }
  for (const module of [...graph.keys()].sort(compareText)) {
    if (!state.has(module)) visit(module);
  }
  return [...found.values()].sort((a, b) => compareText(a.join('\0'), b.join('\0')));
}

async function checkSourceCycles() {
  const root = defaultSourceRoot;
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory()) throw new Error(`source root is not a directory: ${root}`);
  const files = await findSourceFiles(root);
  const graph = new Map();
  const paths = new Map(files.map(file => [file, displayPath(root, file)]));

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    let parsed;
    try {
      parsed = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    } catch (error) {
      throw new Error(`cannot parse ${displayPath(root, file)}: ${error.message}`);
    }
    const requests = parsed.body.flatMap(statement => {
      if (statement.type === 'ImportDeclaration' || statement.type === 'ExportAllDeclaration') {
        return [statement.source.value];
      }
      if (statement.type === 'ExportNamedDeclaration' && statement.source !== null) {
        return [statement.source.value];
      }
      return [];
    });
    const dependencies = new Set();
    for (const specifier of requests) {
      const dependency = await resolveRelativeImport(root, file, specifier);
      if (dependency !== null) dependencies.add(paths.get(dependency) ?? displayPath(root, dependency));
    }
    graph.set(displayPath(root, file), [...dependencies].sort(compareText));
  }

  const cycles = findCycles(graph);
  return { moduleCount: files.length, cycles };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 0) throw new Error('usage: node scripts/check-source-cycles.mjs');
  const result = await checkSourceCycles();
  if (result.cycles.length) {
    for (const cycle of result.cycles) console.error(`cycle: ${cycle.join(' -> ')}`);
    console.error(`Found ${result.cycles.length} static relative import cycle(s) among ${result.moduleCount} .mjs modules.`);
    process.exitCode = 1;
  } else {
    console.log(`Checked ${result.moduleCount} .mjs modules; no static relative import cycles.`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
