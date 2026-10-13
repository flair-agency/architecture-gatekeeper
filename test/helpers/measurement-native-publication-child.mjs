// Preload only the output fault; the real native CLI retains its original host arguments.
process.stdout.write = () => { throw new Error('native output unavailable'); };
