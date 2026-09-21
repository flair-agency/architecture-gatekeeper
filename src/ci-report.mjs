#!/usr/bin/env node
import { appendFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMMENT_MARKER = '<!-- architecture-gatekeeper:result:v1 -->';
const MAX_ITEM_LENGTH = 2_000;
const MAX_REPORT_LENGTH = 60_000;
const DECISIONS = new Set(['PASS', 'BLOCK', 'OWNER_DECISION']);

function cleanText(value, limit = MAX_ITEM_LENGTH) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/@(?=[\w-])/g, '@\u200b')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function labelFor(decision) {
  return {
    PASS: ['✅', 'PASS'],
    BLOCK: ['🛑', 'BLOCK'],
    OWNER_DECISION: ['⚠️', 'OWNER DECISION REQUIRED'],
    WAIVED: ['➖', 'ACCEPTED WITHOUT CI AI REVIEW'],
    ERROR: ['❌', 'REVIEW FAILED'],
  }[decision];
}

export function classifyReview({ mode, policyResult, reviewResult, rawDecision }) {
  if (policyResult !== 'success') {
    return { conclusion: 'ERROR', summary: 'Architecture Gate could not resolve the protected base-branch policy.', decision: null };
  }
  if (mode === 'local-only') {
    return { conclusion: 'WAIVED', summary: 'The protected base-branch policy explicitly waives the CI AI review.', decision: null };
  }
  if (mode !== 'enforced') {
    return { conclusion: 'ERROR', summary: 'Architecture Gate resolved an unsupported policy mode.', decision: null };
  }
  if (reviewResult !== 'success') {
    return { conclusion: 'ERROR', summary: 'The model-backed architecture review did not complete successfully.', decision: null };
  }
  try {
    const decision = JSON.parse(rawDecision);
    if (!decision || !DECISIONS.has(decision.decision) || typeof decision.summary !== 'string' || !decision.summary.trim()) {
      throw new Error('missing decision or summary');
    }
    return { conclusion: decision.decision, summary: decision.summary, decision };
  } catch {
    return { conclusion: 'ERROR', summary: 'The architecture reviewer returned an invalid structured decision.', decision: null };
  }
}

function renderList(title, values) {
  if (!Array.isArray(values) || values.length === 0) return '';
  return `\n**${title}**\n\n${values.map((value) => `- ${cleanText(value)}`).join('\n')}\n`;
}

function renderGates(gates) {
  if (!gates || typeof gates !== 'object' || Array.isArray(gates)) return '';
  const rows = Object.entries(gates).map(([name, gate]) => {
    if (!gate || typeof gate !== 'object' || Array.isArray(gate)) return null;
    const decision = cleanText(gate.decision || (gate.applicable === false ? 'NOT_APPLICABLE' : 'UNKNOWN'), 100);
    const summary = cleanText(gate.summary || 'No summary supplied.');
    return `| ${cleanText(name, 200).replaceAll('|', '\\|')} | ${decision.replaceAll('|', '\\|')} | ${summary.replaceAll('|', '\\|')} |`;
  }).filter(Boolean);
  if (rows.length === 0) return '';
  return `\n| Gate | Result | Summary |\n|---|---:|---|\n${rows.join('\n')}\n`;
}

function renderGateDetails(gates) {
  if (!gates || typeof gates !== 'object' || Array.isArray(gates)) return '';
  const sections = Object.entries(gates).map(([name, gate]) => {
    if (!gate || typeof gate !== 'object' || Array.isArray(gate)) return '';
    const details = Object.entries(gate)
      .filter(([key]) => !['decision', 'summary', 'applicable'].includes(key))
      .map(([key, value]) => `- **${cleanText(key, 200)}:** ${cleanText(value)}`)
      .join('\n');
    return details ? `\n**${cleanText(name, 200)}**\n\n${details}\n` : '';
  }).join('');
  return sections ? `\n<details>\n<summary>All evaluation details</summary>\n${sections}\n</details>\n` : '';
}

export function renderReport(classified, metadata = {}) {
  const [icon, label] = labelFor(classified.conclusion);
  const decision = classified.decision;
  let body = `## ${icon} Architecture Gate — ${label}\n\n> ${cleanText(classified.summary)}\n`;
  body += renderGates(decision?.gates);
  if (decision) {
    const context = [
      renderList('Reviewed scope', decision.reviewedScope),
      renderList('Authority files', decision.authorityFiles),
      renderList('Prohibited changes', decision.prohibitedChanges),
      renderList('Responsibility', decision.responsibility),
      renderList('Capability surface', decision.capabilitySurface),
      renderList('Quality guarantees', decision.qualityGuarantees),
    ].join('');
    if (context) body += `\n<details>\n<summary>Reviewed scope and authority</summary>\n${context}\n</details>\n`;
    body += renderGateDetails(decision.gates);
  }
  const links = [];
  if (metadata.reviewedSha) links.push(`Reviewed commit: \`${cleanText(metadata.reviewedSha, 64)}\``);
  if (metadata.runUrl) links.push(`[Actions run](${cleanText(metadata.runUrl, 1_000)})`);
  if (metadata.workflowRef) links.push(`Workflow: \`${cleanText(metadata.workflowRef, 300)}\``);
  if (links.length) body += `\n${links.join(' · ')}\n`;
  if (body.length > MAX_REPORT_LENGTH - COMMENT_MARKER.length - 4) {
    body = `${body.slice(0, MAX_REPORT_LENGTH - COMMENT_MARKER.length - 40)}\n\n_Report truncated._\n`;
  }
  return `${body}\n${COMMENT_MARKER}\n`;
}

export async function upsertPullRequestComment({ fetchImpl = fetch, apiUrl, repository, pullRequest, token, body }) {
  if (!token || !repository || !pullRequest) return { status: 'skipped', reason: 'comment credentials or pull request context unavailable' };
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
  };
  const root = `${apiUrl}/repos/${repository}`;
  const listed = await fetchImpl(`${root}/issues/${pullRequest}/comments?per_page=100`, { headers });
  if (!listed.ok) throw new Error(`list comments returned HTTP ${listed.status}`);
  const comments = await listed.json();
  const existing = comments.find((comment) => comment?.user?.login === 'github-actions[bot]' && comment?.body?.includes(COMMENT_MARKER));
  const url = existing ? `${root}/issues/comments/${existing.id}` : `${root}/issues/${pullRequest}/comments`;
  const response = await fetchImpl(url, { method: existing ? 'PATCH' : 'POST', headers, body: JSON.stringify({ body }) });
  if (!response.ok) throw new Error(`${existing ? 'update' : 'create'} comment returned HTTP ${response.status}`);
  return { status: existing ? 'updated' : 'created' };
}

async function main() {
  const classified = classifyReview({
    mode: process.env.MODE,
    policyResult: process.env.POLICY_RESULT,
    reviewResult: process.env.REVIEW_RESULT,
    rawDecision: process.env.DECISION || '',
  });
  const report = renderReport(classified, {
    reviewedSha: process.env.REVIEWED_SHA,
    runUrl: process.env.RUN_URL,
    workflowRef: process.env.WORKFLOW_REF,
  });
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
  if (process.env.REPORT_PATH) await writeFile(process.env.REPORT_PATH, report);
  try {
    const result = await upsertPullRequestComment({
      apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
      repository: process.env.GITHUB_REPOSITORY,
      pullRequest: process.env.PR_NUMBER,
      token: process.env.GITHUB_TOKEN,
      body: report,
    });
    console.log(`Architecture Gate PR comment: ${result.status}${result.reason ? ` (${result.reason})` : ''}`);
  } catch (error) {
    console.warn(`::warning title=Architecture Gate comment unavailable::${cleanText(error.message, 500)}`);
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `conclusion=${classified.conclusion}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
