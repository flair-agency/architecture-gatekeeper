import { readFileSync, writeSync } from 'node:fs';

const fixture = JSON.parse(readFileSync(3, 'utf8'));
const requests = [];
const violations = [];

globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  const method = options.method || 'GET';
  const route = new URL(url);
  const request = { method, url, origin: route.origin, path: route.pathname, body: options.body ? JSON.parse(options.body) : null };
  requests.push(request);
  if (route.origin !== 'https://api.github.com') {
    violations.push({ type: 'unexpected-origin', method, origin: route.origin, path: route.pathname });
    throw new Error(`Unexpected synthetic API origin: ${route.origin}`);
  }
  const key = `${method} ${route.pathname}`;
  const configured = fixture.responses?.[key];
  if (!configured) {
    violations.push({ type: 'unconfigured-route', method, origin: route.origin, path: route.pathname });
    throw new Error(`Unconfigured synthetic API route: ${key}`);
  }
  const value = configured;
  if (value?.throw) throw new Error(value.throw);
  return {
    ok: value?.status ? value.status >= 200 && value.status < 300 : true,
    status: value?.status || 200,
    async json() { return value?.json ?? []; },
  };
};

process.on('exit', () => {
  writeSync(4, `${JSON.stringify({ requests, violations })}\n`);
});
