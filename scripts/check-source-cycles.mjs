#!/usr/bin/env node

import { lstat, readFile, realpath, readdir } from 'node:fs/promises';
import { parse } from 'acorn';
import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceRootPath = path.resolve(scriptDirectory, '../src');

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function displayPath(root, file) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  return relative.endsWith('.mts') ? `${relative.slice(0, -4)}.mjs` : relative;
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
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        if (/\.(?:js|cjs|jsx|ts|tsx|cts|mjs|mts)$/i.test(entry.name) && !entry.name.endsWith('.mjs') && !entry.name.endsWith('.mts')) {
          throw new Error(`unsupported source file extension (checker covers .mjs and .mts only): ${displayPath(root, absolute)}`);
        }
        if (entry.name.endsWith('.mjs') || entry.name.endsWith('.mts')) files.push(absolute);
      }
    }
  }
  await visit(root);
  files.sort((a, b) => compareText(displayPath(root, a), displayPath(root, b)));
  const labels = new Set();
  for (const file of files) {
    const label = displayPath(root, file);
    if (labels.has(label)) throw new Error(`duplicate authored/runtime module path: ${label}`);
    labels.add(label);
  }
  return files;
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

function relativeSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

async function resolveImport(root, importer, specifier) {
  if (!relativeSpecifier(specifier)) return null;
  if (!specifier.endsWith('.mjs')) {
    throw new Error(`unsupported relative import target from ${displayPath(root, importer)}: ${specifier} (only .mjs specifiers are checked)`);
  }
  const requested = path.resolve(path.dirname(importer), specifier);
  if (!isWithin(root, requested)) throw new Error(`relative import escapes source root from ${displayPath(root, importer)}: ${specifier}`);
  const typedPeer = `${requested.slice(0, -4)}.mts`;
  const target = await lstat(typedPeer).then(() => typedPeer).catch(error => {
    if (error.code === 'ENOENT') return requested;
    throw error;
  });
  await assertNoSymlinkComponents(root, target);
  const info = await lstat(target);
  if (!info.isFile()) throw new Error(`relative import target is not a regular file: ${displayPath(root, target)}`);
  const resolved = await realpath(target);
  if (!isWithin(root, resolved)) throw new Error(`relative import escapes source root from ${displayPath(root, importer)}: ${specifier}`);
  return resolved;
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

function authoredRequests(sourceFile, file) {
  const requests = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const value = node.moduleSpecifier && tsSpecifier(node.moduleSpecifier);
      if (node.moduleSpecifier && value === null) throw new Error(`unsupported relative module form in ${displayPath(sourceRootPath, file)}`);
      if (value !== null && value !== undefined) requests.push({
        specifier: value,
        typeOnly: ts.isImportDeclaration(node)
          ? node.importClause !== undefined && isTypeOnlyImport(node.importClause)
          : isTypeOnlyExport(node),
      });
    } else if (ts.isImportEqualsDeclaration(node)) {
      throw new Error(`unsupported import-equals declaration in ${displayPath(sourceRootPath, file)}`);
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
  const rootInfo = await lstat(sourceRootPath);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error(`source root is not a regular directory: ${sourceRootPath}`);
  const sourceRoot = await realpath(sourceRootPath);
  if (sourceRoot !== sourceRootPath) throw new Error(`source root has a symbolic link component: ${sourceRootPath}`);
  const files = await findSourceFiles(sourceRoot);
  const graph = new Map();

  for (const file of files) {
    const label = displayPath(sourceRoot, file);
    const source = await readFile(file, 'utf8');
    const dependencies = new Set();
    if (file.endsWith('.mjs')) {
      let parsed;
      try { parsed = parse(source, { ecmaVersion: 'latest', sourceType: 'module' }); }
      catch (error) { throw new Error(`cannot parse ${label}: ${error.message}`); }
      const requests = parsed.body.flatMap(statement => {
        if (statement.type === 'ImportDeclaration' || statement.type === 'ExportAllDeclaration') return [statement.source.value];
        if (statement.type === 'ExportNamedDeclaration' && statement.source !== null) return [statement.source.value];
        return [];
      });
      for (const specifier of requests) {
        const dependency = await resolveImport(sourceRoot, file, specifier);
        if (dependency !== null) dependencies.add(displayPath(sourceRoot, dependency));
      }
    } else {
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const syntaxDiagnostics = sourceFile.parseDiagnostics;
      if (syntaxDiagnostics.length) {
        const diagnostic = syntaxDiagnostics[0];
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        throw new Error(`cannot parse ${label}: ${message}`);
      }
      for (const request of authoredRequests(sourceFile, file)) {
        const dependency = await resolveImport(sourceRoot, file, request.specifier);
        if (dependency !== null && !request.typeOnly) dependencies.add(displayPath(sourceRoot, dependency));
      }
    }
    graph.set(label, [...dependencies].sort(compareText));
  }

  return {
    moduleCount: graph.size,
    runtimeCount: files.filter(file => file.endsWith('.mjs')).length,
    authoredCount: files.filter(file => file.endsWith('.mts')).length,
    cycles: findCycles(graph),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 0) throw new Error('usage: node scripts/check-source-cycles.mjs');
  const result = await checkSourceCycles();
  if (result.cycles.length) {
    for (const cycle of result.cycles) console.error(`cycle: ${cycle.join(' -> ')}`);
    console.error(`Found ${result.cycles.length} static relative dependency cycle(s) among ${result.moduleCount} checked modules.`);
    process.exitCode = 1;
  } else {
    console.log(`Checked ${result.runtimeCount} runtime .mjs and ${result.authoredCount} authored .mts modules; no static relative dependency cycles.`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
