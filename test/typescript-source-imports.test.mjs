import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(root, 'src');
const outputRoot = join(root, 'dist');
const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined, 'the adopted tsconfig must parse');
const config = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(config.errors, [], 'the adopted tsconfig must not contain errors');

function filesUnder(directory, suffix) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path, suffix) : entry.isFile() && path.endsWith(suffix) ? [path] : [];
  });
}

function staticModuleReferences(sourceFile) {
  return sourceFile.statements.flatMap(statement => {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return [];
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    return [{ statement, specifier: statement.moduleSpecifier.text }];
  });
}

function isRuntimeReference({ statement }) {
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) return !clause;
    const named = clause.namedBindings;
    const onlyTypeNamedBindings = named && ts.isNamedImports(named) && named.elements.length > 0 &&
      named.elements.every(element => element.isTypeOnly) && !clause.name;
    return !onlyTypeNamedBindings;
  }
  if (statement.isTypeOnly) return false;
  const clause = statement.exportClause;
  return !(clause && ts.isNamedExports(clause) && clause.elements.length > 0 &&
    clause.elements.every(element => element.isTypeOnly));
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function emittedSpecifier(specifier) {
  return isRelativeSpecifier(specifier) && specifier.endsWith('.mts')
    ? `${specifier.slice(0, -4)}.mjs` : specifier;
}

function sourcePathForSpecifier(importer, specifier) {
  return resolve(dirname(importer), specifier);
}

function outputPathForSource(sourcePath) {
  return join(outputRoot, relative(sourceRoot, sourcePath).replace(/\.mts$/, '.mjs'));
}

test('strict TypeScript rewrites authored module references to distributable JavaScript paths', () => {
  assert.equal(config.options.rewriteRelativeImportExtensions, true,
    'the adopted tsconfig must rewrite relative TypeScript extensions during emit');

  const sourceFiles = [...filesUnder(sourceRoot, '.mjs'), ...filesUnder(sourceRoot, '.mts')];
  assert.ok(sourceFiles.some(path => path.endsWith('.mts')), 'authored TypeScript modules must be present');

  for (const sourcePath of sourceFiles) {
    const sourceText = readFileSync(sourcePath, 'utf8');
    const isTypeScript = sourcePath.endsWith('.mts');
    const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true,
      isTypeScript ? ts.ScriptKind.TS : ts.ScriptKind.JS);
    const references = staticModuleReferences(sourceFile);
    const runtimeExpected = [];

    for (const reference of references) {
      const { specifier } = reference;
      if (isRelativeSpecifier(specifier)) {
        assert.match(specifier, /\.(?:mjs|mts)$/, `${relative(root, sourcePath)} uses an unsupported relative module suffix: ${specifier}`);
        const target = sourcePathForSpecifier(sourcePath, specifier);
        if (specifier.endsWith('.mjs')) {
          const typedPeer = `${target.slice(0, -4)}.mts`;
          assert.ok(existsSync(target), existsSync(typedPeer)
            ? `${relative(root, sourcePath)} must reference its physical .mts peer: ${specifier}`
            : `${relative(root, sourcePath)} must name a physical source module: ${specifier}`);
        } else assert.ok(existsSync(target), `${relative(root, sourcePath)} must name a physical source module: ${specifier}`);
      }
      if (!isTypeScript || isRuntimeReference(reference)) runtimeExpected.push(emittedSpecifier(specifier));
    }

    const outputPath = outputPathForSource(sourcePath);
    assert.ok(existsSync(outputPath), `the emitted module must exist: ${relative(root, outputPath)}`);
    const outputFile = ts.createSourceFile(outputPath, readFileSync(outputPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const outputReferences = staticModuleReferences(outputFile).map(({ specifier }) => specifier);
    assert.deepEqual(outputReferences.sort(), runtimeExpected.sort(),
      `${relative(root, outputPath)} must preserve the source module bindings after type-only erasure and extension rewriting`);

    for (const specifier of outputReferences) {
      assert.ok(!specifier.endsWith('.mts'), `${relative(root, outputPath)} must not retain a .mts runtime reference: ${specifier}`);
      if (!isRelativeSpecifier(specifier)) continue;
      assert.match(specifier, /\.mjs$/, `${relative(root, outputPath)} must use a JavaScript module suffix: ${specifier}`);
      assert.ok(existsSync(resolve(dirname(outputPath), specifier)),
        `${relative(root, outputPath)} must resolve its emitted module: ${specifier}`);
    }
  }
});
