import assert from 'node:assert/strict';
import ts from 'typescript';

// A raw diagnostic retains its complete compiler AST. Keep assertion failures
// readable and bounded to the diagnostic rather than inspecting that graph.
export function summarizeDiagnostics(diagnostics) {
  return diagnostics.map(item => ({
    code: item.code, file: item.file?.fileName, start: item.start, length: item.length,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  }));
}

// Compile each suite's module fixtures together; every fixture still has its
// own exact diagnostic oracle in the caller. Never discard dependency errors.
export function compileFixtureDiagnostics(files, options, dependencyMessage) {
  const fixtures = new Set(files);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options));
  assert.deepEqual(summarizeDiagnostics(diagnostics.filter(item => !fixtures.has(item.file?.fileName))), [], dependencyMessage);
  return file => {
    assert.ok(fixtures.has(file), `Uncompiled type fixture: ${file}`);
    return diagnostics.filter(item => item.file?.fileName === file);
  };
}
