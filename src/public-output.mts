// Completion observes the writable callback, not merely queue admission.
export function writePublicOutput(output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (!settled) { settled = true; reject(error); }
    };
    process.stdout.on('error', fail);
    const cleanup = () => process.stdout.removeListener('error', fail);
    try {
      process.stdout.write(output, error => {
        // Node emits the stream error after invoking a failed write callback.
        if (error) { fail(error); setImmediate(cleanup); }
        else { cleanup(); if (!settled) { settled = true; resolve(); } }
      });
    } catch (error) { cleanup(); settled = true; reject(error); }
  });
}
