# #254 parallel Git stall regressions

The three isolated Git-stall cases in
`test/measurement-core-fault-isolation.test.mjs` each launch the same helper in
a separate Node process. The helper creates its own temporary Git repository,
measurement directory, and mock `git` executable; its `PATH` change stays in
that child process. The parent now runs these three unchanged cases under a
`describe` suite with concurrency 3 and uses asynchronous `execFile`, so the
cases can overlap without sharing process environment or fixture paths.

Each child retains its 20-second outer timeout and 1 MiB output bound. Launch
errors, nonzero exits, and timeouts reject with a stage-specific message and
the original error as cause. Successful `execFile` completion supplies the
existing zero-exit/no-process-error condition; no synthetic status is asserted.
The Windows skip remains. The helper's existing 9–18 second measured request interval,
completed PASS records, and unavailable selected-input metadata assertions are
unchanged. The 17 earlier core fault cases continue to use their original
synchronous child invocations.

This change only alters test scheduling. It does not shorten the request or
outer timeout, replace the real stall, change clocks, or alter measurement
production behavior. The paired before/after focused timing and overlap/failure
propagation controls are recorded by the coordinator; no timing result is
claimed here.
