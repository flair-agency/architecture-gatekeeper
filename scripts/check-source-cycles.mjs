#!/usr/bin/env node

import { lstat, readFile, realpath, readdir } from 'node:fs/promises';
import { parse } from 'acorn';
import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceRoots = [
  { directory: path.resolve(scriptDirectory, '../src'), extensions: ['.mjs'], runtime: true },
  { directory: path.resolve(scriptDirectory, '../src-ts'), extensions: ['.mts'], runtime: false, optional: true },
];

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

async function findSourceFiles(root, extensions, { runtime }) {
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
        if (/\.(?:js|cjs|jsx|ts|tsx|mts|cts|mjs)$/i.test(entry.name) && !extensions.some(extension => entry.name.endsWith(extension))) {
          throw new Error(`unsupported source file extension (checker covers ${runtime ? '.mjs' : '.mts'} only): ${displayPath(root, absolute)}`);
        }
        if (extensions.some(extension => entry.name.endsWith(extension))) files.push(absolute);
      }
    }
  }
  await visit(root);
  return files.sort((a, b) => compareText(displayPath(root, a), displayPath(root, b)));
}

async function assertNoSymlinkComponents(root, target, missingMessage = `missing relative .mjs import target: ${displayPath(root, target)}`) {
  const relative = path.relative(root, target);
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const info = await lstat(current).catch(error => {
      if (error.code === 'ENOENT') throw new Error(missingMessage);
      throw error;
    });
    if (info.isSymbolicLink()) throw new Error(`symbolic link is not supported in relative import target: ${displayPath(root, current)}`);
  }
}

async function resolveTarget(root, importer, specifier) {
  const target = path.resolve(path.dirname(importer), specifier);
  if (!isWithin(root, target)) throw new Error(`relative import escapes source root from ${displayPath(root, importer)}: ${specifier}`);
  await assertNoSymlinkComponents(root, target);
  const info = await lstat(target);
  if (!info.isFile()) throw new Error(`relative import target is not a regular file: ${displayPath(root, target)}`);
  const resolved = await realpath(target);
  if (!isWithin(root, resolved)) throw new Error(`relative import escapes source root from ${displayPath(root, importer)}: ${specifier}`);
  return resolved;
}

function relativeSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

async function resolveMjsImport(root, importer, specifier) {
  if (!relativeSpecifier(specifier)) return null;
  if (!specifier.endsWith('.mjs')) {
    throw new Error(`unsupported relative import target from ${displayPath(root, importer)}: ${specifier} (only .mjs targets are checked)`);
  }
  return resolveTarget(root, importer, specifier);
}

function tsSpecifier(node) {
  return ts.isStringLiteralLike(node) ? node.text : null;
}

function isTypeOnlyImport(clause) {
  if (clause.isTypeOnly || clause.name) return clause.isTypeOnly;
  const bindings = clause.namedBindings;
  return bindings !== undefined && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every(element => element.isTypeOnly);
}

function isTypeOnlyExport(declaration) {
  if (declaration.isTypeOnly) return true;
  const clause = declaration.exportClause;
  return clause !== undefined && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every(element => element.isTypeOnly);
}

function authoredRequests(sourceFile, root, file) {
  const requests = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const value = node.moduleSpecifier && tsSpecifier(node.moduleSpecifier);
      if (node.moduleSpecifier && value === null) throw new Error(`unsupported relative module form in ${displayPath(root, file)}`);
      if (value !== null && value !== undefined) requests.push({ specifier: value, typeOnly: ts.isImportDeclaration(node) ? node.importClause !== undefined && isTypeOnlyImport(node.importClause) : isTypeOnlyExport(node) });
    } else if (ts.isImportEqualsDeclaration(node)) {
      throw new Error(`unsupported import-equals declaration in ${displayPath(root, file)}`);
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteralLike(argument.literal)) {
        requests.push({ specifier: argument.literal.text, typeOnly: true });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return requests;
}

async function resolveMtsImport(root, importer, specifier, roots) {
  if (!relativeSpecifier(specifier)) return null;
  if (!specifier.endsWith('.mjs')) {
    throw new Error(`unsupported relative import target from ${displayPath(root, importer)}: ${specifier} (authoring imports must use .mjs specifiers)`);
  }
  const typedRoot = roots.find(item => !item.runtime)?.directory;
  const runtimeRoot = roots.find(item => item.runtime).directory;
  const requestedTarget = path.resolve(path.dirname(importer), specifier);
  if (isWithin(typedRoot, requestedTarget)) {
    const typedTarget = `${requestedTarget.slice(0, -4)}.mts`;
    await assertNoSymlinkComponents(typedRoot, typedTarget, `missing authored .mts target for ${displayPath(root, importer)}: ${specifier}`);
    const typedInfo = await lstat(typedTarget).catch(error => {
      if (error.code === 'ENOENT') throw new Error(`missing authored .mts target for ${displayPath(root, importer)}: ${specifier}`);
      throw error;
    });
    if (!typedInfo.isFile()) throw new Error(`relative import target is not a regular file: ${displayPath(typedRoot, typedTarget)}`);
    const resolved = await realpath(typedTarget);
    if (!isWithin(typedRoot, resolved)) throw new Error(`relative import escapes source root from ${displayPath(root, importer)}: ${specifier}`);
    return resolved;
  }

  // A bridge must be explicit in the authored specifier and land physically in src/.
  if (!isWithin(runtimeRoot, requestedTarget)) {
    throw new Error(`relative import escapes fixed source roots from ${displayPath(root, importer)}: ${specifier}`);
  }
  await assertNoSymlinkComponents(runtimeRoot, requestedTarget);
  const info = await lstat(requestedTarget);
  if (!info.isFile()) throw new Error(`relative import target is not a regular file: ${displayPath(runtimeRoot, requestedTarget)}`);
  const resolved = await realpath(requestedTarget);
  if (!isWithin(runtimeRoot, resolved)) throw new Error(`relative import escapes fixed source roots from ${displayPath(root, importer)}: ${specifier}`);
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
      } else if (!state.has(dependency)) visit(dependency);
    }
    stack.pop();
    state.set(module, 2);
  }
  for (const module of [...graph.keys()].sort(compareText)) if (!state.has(module)) visit(module);
  return [...found.values()].sort((a, b) => compareText(a.join('\0'), b.join('\0')));
}

async function checkSourceCycles() {
  const roots = [];
  let authoredRootPresent = false;
  for (const candidate of sourceRoots) {
    const rootInfo = await lstat(candidate.directory).catch(error => {
      if (candidate.optional && error.code === 'ENOENT') return null;
      throw error;
    });
    if (!rootInfo) continue;
    if (!candidate.runtime) authoredRootPresent = true;
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error(`source root is not a regular directory: ${candidate.directory}`);
    const canonicalDirectory = await realpath(candidate.directory);
    if (canonicalDirectory !== candidate.directory) throw new Error(`source root has a symbolic link component: ${candidate.directory}`);
    const root = { ...candidate, directory: canonicalDirectory };
    roots.push({ ...root, files: await findSourceFiles(root.directory, root.extensions, root) });
  }

  const graph = new Map();
  const pathForFile = new Map();
  const runtimeRoot = roots.find(item => item.runtime).directory;
  for (const root of roots) for (const file of root.files) {
    const relative = displayPath(root.directory, file);
    if (root.runtime) {
      pathForFile.set(file, relative);
    } else {
      const emittedRelative = `${relative.slice(0, -4)}.mjs`;
      const emitted = path.resolve(sourceRoots[0].directory, emittedRelative);
      const emittedInfo = await lstat(emitted).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
      pathForFile.set(file, emittedInfo?.isFile() ? emittedRelative : `src-ts/${relative}`);
    }
  }

  for (const root of roots) {
    for (const file of root.files) {
      const label = pathForFile.get(file);
      const source = await readFile(file, 'utf8');
      const dependencies = new Set();
      if (root.runtime) {
        let parsed;
        try { parsed = parse(source, { ecmaVersion: 'latest', sourceType: 'module' }); }
        catch (error) { throw new Error(`cannot parse ${label}: ${error.message}`); }
        const requests = parsed.body.flatMap(statement => {
          if (statement.type === 'ImportDeclaration' || statement.type === 'ExportAllDeclaration') return [statement.source.value];
          if (statement.type === 'ExportNamedDeclaration' && statement.source !== null) return [statement.source.value];
          return [];
        });
        for (const specifier of requests) {
          const dependency = await resolveMjsImport(root.directory, file, specifier);
          if (dependency !== null) dependencies.add(pathForFile.get(dependency) ?? `src/${displayPath(root.directory, dependency)}`);
        }
      } else {
        const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const syntaxDiagnostics = sourceFile.parseDiagnostics;
        if (syntaxDiagnostics.length) {
          const diagnostic = syntaxDiagnostics[0];
          const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
          throw new Error(`cannot parse ${label}: ${message}`);
        }
        for (const request of authoredRequests(sourceFile, root.directory, file)) {
          const dependency = await resolveMtsImport(root.directory, file, request.specifier, roots);
          if (dependency !== null && !request.typeOnly) dependencies.add(pathForFile.get(dependency) ?? displayPath(runtimeRoot, dependency));
        }
      }
      graph.set(label, [...new Set([...(graph.get(label) ?? []), ...dependencies])].sort(compareText));
    }
  }

  const cycles = findCycles(graph);
  return { moduleCount: graph.size, runtimeCount: roots.find(item => item.runtime)?.files.length ?? 0, authoredCount: roots.find(item => !item.runtime)?.files.length ?? 0, authoredRootPresent, cycles };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 0) throw new Error('usage: node scripts/check-source-cycles.mjs');
  const result = await checkSourceCycles();
  if (result.cycles.length) {
    for (const cycle of result.cycles) console.error(`cycle: ${cycle.join(' -> ')}`);
    if (result.authoredRootPresent) console.error(`Found ${result.cycles.length} static relative dependency cycle(s) among ${result.moduleCount} checked modules.`);
    else console.error(`Found ${result.cycles.length} static relative import cycle(s) among ${result.moduleCount} .mjs modules.`);
    process.exitCode = 1;
  } else {
    if (result.authoredRootPresent) console.log(`Checked ${result.runtimeCount} runtime .mjs and ${result.authoredCount} authored .mts modules; no static relative dependency cycles.`);
    else console.log(`Checked ${result.runtimeCount} .mjs modules; no static relative import cycles.`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
