import ts from 'typescript';
import {
  lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
if (process.argv.length > 2 && !checkOnly) {
  process.stderr.write('Usage: node scripts/build-typescript.mjs [--check]\n');
  process.exit(2);
}

const sourceRoot = join(root, 'src-ts');
const configPath = join(root, 'tsconfig.json');
const outputMap = new Map([
  ['owner-addition/owner-addition-validation.mjs', 'src/owner-addition/owner-addition-validation.mjs'],
]);
const temporaryRoot = mkdtempSync(join(tmpdir(), 'architecture-gatekeeper-typescript-'));

function reportDiagnostics(diagnostics) {
  for (const diagnostic of diagnostics) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    if (diagnostic.file && diagnostic.start !== undefined) {
      const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      process.stderr.write(`${diagnostic.file.fileName}:${location.line + 1}:${location.character + 1}: ${message}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
  }
}

function isInside(parent, path) {
  const childPath = relative(parent, path);
  return childPath === '' || (!isAbsolute(childPath) && childPath !== '..' && !childPath.startsWith(`..${sep}`));
}

function assertSafeCheckoutPath(path, { allowMissing = false, kind, singleLink = false } = {}) {
  const absolutePath = resolve(path);
  if (!isInside(root, absolutePath)) throw new Error(`Path escapes the fixed checkout: ${path}`);
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Fixed checkout root must be a real directory.');
  const components = relative(root, absolutePath).split(sep).filter(Boolean);
  let current = root;
  for (const [index, component] of components.entries()) {
    current = join(current, component);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return false;
      throw new Error(`Unable to inspect checkout path ${relative(root, current)}: ${error.message}`);
    }
    if (stat.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in checkout paths: ${relative(root, current)}`);
    const finalComponent = index === components.length - 1;
    if (!finalComponent && !stat.isDirectory()) throw new Error(`Checkout path component is not a directory: ${relative(root, current)}`);
    if (finalComponent && kind === 'file' && !stat.isFile()) throw new Error(`Checkout output is not a regular file: ${relative(root, current)}`);
    if (finalComponent && kind === 'directory' && !stat.isDirectory()) throw new Error(`Checkout path is not a directory: ${relative(root, current)}`);
    if (singleLink && finalComponent && stat.isFile() && stat.nlink !== 1) {
      throw new Error(`Hard-linked generated output is not allowed: ${relative(root, current)}`);
    }
  }
  return true;
}

function walkCheckout(directory, { singleLink = false } = {}) {
  assertSafeCheckoutPath(directory, { kind: 'directory' });
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    const exists = assertSafeCheckoutPath(path, { singleLink });
    if (!exists) return [];
    const stat = lstatSync(path);
    if (stat.isDirectory()) return walkCheckout(path, { singleLink });
    if (stat.isFile()) return [path];
    throw new Error(`Unsupported checkout file type: ${relative(root, path)}`);
  });
}

function walkTemporary(directory) {
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Temporary compiler output contains a non-directory path.');
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    const childStat = lstatSync(path);
    if (childStat.isSymbolicLink()) throw new Error('Temporary compiler output contains a symbolic link.');
    if (childStat.isDirectory()) return walkTemporary(path);
    if (childStat.isFile()) return [path];
    throw new Error('Temporary compiler output contains an unsupported file type.');
  });
}

function unexpectedMappedOutputs() {
  const mappedDirectory = join(root, 'src/owner-addition');
  if (!assertSafeCheckoutPath(mappedDirectory, { allowMissing: true, kind: 'directory', singleLink: true })) return [];
  const expectedDestinations = new Set(outputMap.values());
  return walkCheckout(mappedDirectory, { singleLink: true })
    .map(path => relative(root, path).split('\\').join('/'))
    .filter(path => !expectedDestinations.has(path));
}

try {
  assertSafeCheckoutPath(join(root, 'src'), { kind: 'directory' });
  assertSafeCheckoutPath(sourceRoot, { kind: 'directory' });
  walkCheckout(sourceRoot);
  assertSafeCheckoutPath(configPath, { kind: 'file' });
  for (const destinationPath of outputMap.values()) {
    assertSafeCheckoutPath(join(root, destinationPath), { allowMissing: true, kind: 'file', singleLink: true });
  }

  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    reportDiagnostics([config.error]);
    process.exitCode = 1;
  } else {
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
    for (const sourcePath of parsed.fileNames) {
      const absoluteSource = resolve(sourcePath);
      if (!isInside(sourceRoot, absoluteSource) || absoluteSource === sourceRoot) {
        throw new Error(`TypeScript source is outside src-ts: ${sourcePath}`);
      }
      assertSafeCheckoutPath(absoluteSource, { kind: 'file' });
    }
    const options = {
      ...parsed.options,
      rootDir: sourceRoot,
      outDir: temporaryRoot,
      noEmit: false,
      noEmitOnError: true,
    };
    const program = ts.createProgram(parsed.fileNames, options);
    const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
    if (diagnostics.length > 0) {
      reportDiagnostics(diagnostics);
      process.exitCode = 1;
    } else {
      const emit = program.emit();
      if (emit.emitSkipped || emit.diagnostics.length > 0) {
        reportDiagnostics(emit.diagnostics);
        process.exitCode = 1;
      } else {
        const emitted = walkTemporary(temporaryRoot);
        const actualRelative = emitted.map(path => relative(temporaryRoot, path).split('\\').join('/')).sort();
        const expectedRelative = [...outputMap.keys()].sort();
        if (JSON.stringify(actualRelative) !== JSON.stringify(expectedRelative)) {
          process.stderr.write(`TypeScript emitted an unexpected mapped output set. Expected ${expectedRelative.join(', ') || '(none)'}, got ${actualRelative.join(', ') || '(none)'}.\n`);
          process.exitCode = 1;
        } else {
          const extraOutputs = unexpectedMappedOutputs();
          if (extraOutputs.length > 0) {
            process.stderr.write(`Unexpected generated .mjs output: ${extraOutputs.join(', ')}.\n`);
            process.exitCode = 1;
          }
          let stale = false;
          const verifyOrWriteOutputs = checkOnly || extraOutputs.length === 0;
          for (const [temporaryPath, destinationPath] of verifyOrWriteOutputs ? outputMap : []) {
            const generated = readFileSync(join(temporaryRoot, temporaryPath), 'utf8');
            const destination = join(root, destinationPath);
            if (checkOnly) {
              const exists = assertSafeCheckoutPath(destination, { allowMissing: true, kind: 'file', singleLink: true });
              const checkedIn = exists ? readFileSync(destination, 'utf8') : undefined;
              if (checkedIn !== generated) {
                process.stderr.write(`Generated output is missing or stale: ${destinationPath}\n`);
                stale = true;
              }
            } else {
              const destinationDirectory = dirname(destination);
              if (!assertSafeCheckoutPath(destinationDirectory, { allowMissing: true, kind: 'directory' })) {
                mkdirSync(destinationDirectory, { recursive: true });
              }
              assertSafeCheckoutPath(destinationDirectory, { kind: 'directory' });
              assertSafeCheckoutPath(destination, { allowMissing: true, kind: 'file', singleLink: true });
              writeFileSync(destination, generated);
            }
          }
          if (checkOnly) {
            if (extraOutputs.length > 0) stale = true;
            if (stale) process.exitCode = 1;
          }
        }
      }
    }
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

if (process.exitCode !== 1) {
  process.stdout.write(checkOnly ? 'TypeScript outputs are current.\n' : 'TypeScript outputs generated.\n');
}
