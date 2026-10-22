/** Pure copy of the PR-description workflow's visible-field validation rules. */
export type PrDescriptionValidation = Readonly<{ ok: boolean; errors: readonly string[] }>;

const REQUIRED = ['Outcome', 'Issue coverage', 'Verification', 'Remaining work', 'Authority and assurance'] as const;

export function validatePrDescription(body: unknown): PrDescriptionValidation {
  if (typeof body !== 'string') return Object.freeze({ ok: false, errors: Object.freeze(['PR body is missing or malformed.']) });
  const visible: string[] = [];
  let fence: { marker: string; length: number } | null = null;
  for (const line of body.replace(/<!--[\s\S]*?(?:-->|$)/g, '').split(/\r?\n/)) {
    if (fence) {
      const closing = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (closing && closing[1][0] === fence.marker && closing[1].length >= fence.length) fence = null;
      continue;
    }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (opening && (opening[1][0] !== '`' || !opening[2].includes('`'))) {
      fence = { marker: opening[1][0], length: opening[1].length };
      continue;
    }
    visible.push(line);
  }
  const text = visible.join('\n');
  const headings = [...text.matchAll(/^## +([^\n]+?) *$/gm)];
  const errors: string[] = [];
  const fields: Record<string, string> = {};
  const order = headings.filter(h => (REQUIRED as readonly string[]).includes(h[1])).map(h => h[1]);
  if (order.length === REQUIRED.length && order.some((name, index) => name !== REQUIRED[index])) errors.push('Use the required sections in the template order.');
  for (const name of REQUIRED) {
    const matches = headings.filter(h => h[1] === name);
    if (matches.length !== 1) { errors.push(`Include exactly one ## ${name} section.`); continue; }
    const heading = matches[0];
    const next = headings.find(other => other.index > heading.index);
    const value = text.slice(heading.index + heading[0].length, next?.index ?? text.length).trim();
    fields[name] = value;
    const content = value.replace(/^[-*] +\[[ xX]\] */gm, '').trim();
    if (!content || /^(?:N\/?A|None|TBD|TODO|_No response_|\.\.\.)[.!]?$/i.test(content) || /^<[^>]+>$/.test(content)) {
      errors.push(`Complete ## ${name}; explain non-applicable fields.`);
    }
  }
  const hasIssue = (value: string | undefined) => /(?:^|[\s(])(?:[\w.-]+\/[\w.-]+)?#\d+\b|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+\b/.test(value ?? '');
  if (fields['Issue coverage'] && !hasIssue(fields['Issue coverage']) && !/^N\/?A\b[\s:—-]+\S[\s\S]+/i.test(fields['Issue coverage'])) {
    errors.push('Issue coverage needs an issue reference or N/A with a reason.');
  }
  if (fields['Remaining work'] && !hasIssue(fields['Remaining work']) && !/^None\b[\s:—-]+\S[\s\S]+/i.test(fields['Remaining work'])) {
    errors.push('Remaining work needs an owning issue reference or None with a reason.');
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export type QueueCompletenessInput = Readonly<{ prNumber: unknown; baseSha: unknown; headSha: unknown; token: unknown; fetchImpl?: (url: string, init: { headers: Record<string, string>; redirect: 'error'; signal: AbortSignal }) => Promise<unknown> }>;
export type QueueCompletenessResult = PrDescriptionValidation & Readonly<{ status: 'VALIDATED' | 'INCOMPLETE'; reason?: string }>;
const API = 'https://api.github.com';
const REPOSITORY = 'flair-agency/architecture-gatekeeper';
const REPOSITORY_ID = 1379218762;
const SHA = /^[a-f0-9]{40}$/;
const REQUEST_TIMEOUT_MS = 10_000;
// Conservative cap for the complete decoded API JSON envelope, including body and metadata.
const MAX_RESPONSE_BYTES = 65_536;
const incomplete = (reason: string): QueueCompletenessResult => Object.freeze({ status: 'INCOMPLETE', ok: false, errors: Object.freeze([]), reason });

async function readBoundedJson(response: any): Promise<any> {
  if (!response || response.status !== 200 || response.redirected === true || !response.body || typeof response.body.getReader !== 'function') throw new Error('GitHub metadata response is unavailable or redirected.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || size + value.byteLength > MAX_RESPONSE_BYTES) throw new Error('GitHub metadata response exceeds the byte limit.');
      size += value.byteLength;
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** Fetch and validate exactly one live same-repository PR for protected Queue use. */
export async function validateQueuedPrDescription(input: QueueCompletenessInput): Promise<QueueCompletenessResult> {
  try {
    const number = input?.prNumber;
    if (!Number.isSafeInteger(Number(number)) || Number(number) < 1 || String(number) !== String(Number(number)) ||
        typeof input.baseSha !== 'string' || !SHA.test(input.baseSha) || typeof input.headSha !== 'string' || !SHA.test(input.headSha) ||
        input.baseSha === input.headSha || typeof input.token !== 'string' || input.token.length < 1 || input.token.length > 16_384 || /[\u0000\r\n]/.test(input.token)) {
      return incomplete('Trusted queue PR bindings or API token are invalid.');
    }
    const fetchImpl = input.fetchImpl ?? fetch;
    const url = `${API}/repos/${REPOSITORY}/pulls/${encodeURIComponent(String(number))}`;
    const response = await fetchImpl(url, { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${input.token}`, 'x-github-api-version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }) as any;
    if (response?.url && response.url !== url) return incomplete('GitHub metadata response URL does not match the fixed self-repository endpoint.');
    const pr = await readBoundedJson(response);
    if (!pr || typeof pr !== 'object' || Array.isArray(pr) || pr.number !== Number(number) || pr.state !== 'open' || pr.draft !== false ||
        pr.base?.ref !== 'main' || pr.base?.repo?.full_name !== REPOSITORY || pr.base?.repo?.id !== REPOSITORY_ID || pr.base?.sha !== input.baseSha ||
        pr.head?.repo?.full_name !== REPOSITORY || pr.head?.repo?.id !== REPOSITORY_ID || pr.head?.sha !== input.headSha ||
        typeof pr.body !== 'string' || Buffer.byteLength(pr.body, 'utf8') > MAX_RESPONSE_BYTES) return incomplete('Live PR does not match the exact same-repository main-base/head tuple or has no bounded body.');
    const validation = validatePrDescription(pr.body);
    return Object.freeze({ ...validation, status: validation.ok ? 'VALIDATED' : 'INCOMPLETE' });
  } catch (error) {
    return incomplete(error instanceof Error ? error.message : 'GitHub PR metadata selection failed.');
  }
}
