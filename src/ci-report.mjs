#!/usr/bin/env node
import { appendFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMMENT_MARKER = '<!-- architecture-gatekeeper:result:v1 -->';
export const ADVISORY_COMMENT_MARKER = '<!-- architecture-gatekeeper:result:v2 -->';
const OWNER_INTERVENTION_URL = 'https://github.com/flair-agency/architecture-gatekeeper/blob/main/docs/owner-intervention.md';
const MAX_ITEM_LENGTH = 2_000;
const MAX_REPORT_LENGTH = 60_000;
const DECISIONS = new Set(['PASS', 'BLOCK', 'OWNER_DECISION']);
const AUTHORITY_ID = /^[a-z][a-z0-9-]{0,63}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const AUTHORITY_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function digestDecision(decision) {
  if (!decision || typeof decision !== 'object') return '';
  return createHash('sha256').update(JSON.stringify(canonicalize(decision))).digest('hex');
}

export function parseAuthorityProvenance(encoded, required = false) {
  if (!encoded) {
    if (required) throw new Error('Missing Authority Set provenance output.');
    return null;
  }
  if (typeof encoded !== 'string' || encoded.length > 32_768 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Invalid Authority Set provenance output.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new Error('Invalid Authority Set provenance encoding.');
  const value = JSON.parse(bytes.toString('utf8'));
  if (!value || value.version !== 1 || !/^[a-f0-9]{64}$/.test(value.manifestSha256) ||
      !/^[a-f0-9]{64}$/.test(value.setDigest) || !Array.isArray(value.members) ||
      !value.members.length || value.members.length > 32 ||
      value.members.some(member => !member || typeof member.id !== 'string' || !AUTHORITY_ID.test(member.id) ||
        typeof member.repository !== 'string' || !REPOSITORY.test(member.repository) ||
        !/^[a-f0-9]{40}$/.test(member.resolvedCommit) ||
        typeof member.path !== 'string' || member.path.length > 240 || !AUTHORITY_PATH.test(member.path) ||
        member.path.split('/').some(part => part === '.' || part === '..') ||
        !/^[a-f0-9]{64}$/.test(member.sha256)) ||
      new Set(value.members.map(member => member.id)).size !== value.members.length) {
    throw new Error('Invalid Authority Set provenance record.');
  }
  return value;
}

export function parseOwnerAdditionProcedure(encoded, required = false) {
  if (!encoded) {
    if (required) throw new Error('Missing G0 owner-addition procedure output.');
    return null;
  }
  if (typeof encoded !== 'string' || encoded.length > 8_192 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('Invalid G0 owner-addition procedure output.');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new Error('Invalid G0 owner-addition procedure encoding.');
  const value = JSON.parse(bytes.toString('utf8'));
  if (!value || value.procedure !== 'VALID_G0_OWNER_ADDITION' || value.grade !== 'G0' ||
      !REPOSITORY.test(value.repository) ||
      !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value.baseSha) ||
      !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value.headSha) ||
      value.baseSha.length !== value.headSha.length ||
      value.policyRevision !== value.baseSha ||
      !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value.tagObjectOid) ||
      value.tagObjectOid.length !== value.headSha.length ||
      !AUTHORITY_ID.test(value.authorityId) ||
      typeof value.authorityPath !== 'string' || !AUTHORITY_PATH.test(value.authorityPath) ||
      !/^[a-f0-9]{64}$/.test(value.previousAuthoritySha256) ||
      !/^[a-f0-9]{64}$/.test(value.newAuthoritySha256) ||
      value.tagRef !== `refs/tags/architecture-owner-addition/${value.headSha}` ||
      typeof value.missingDecisionId !== 'string' || value.missingDecisionId.length > 100 ||
      !/^[a-f0-9]{64}$/.test(value.additionRecordSha256) ||
      value.principalAuthentication !== 'not_verified' ||
      value.semanticEligibility !== 'requires_separate_protected_review') {
    throw new Error('Invalid G0 owner-addition procedure record.');
  }
  return value;
}

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
    OWNER_ADDITION_G0: ['✅', 'OWNER_ADDITION / G0'],
    ADVISORY_ONLY: ['ℹ️', 'ADVISORY ONLY'],
    WAIVED: ['➖', 'ACCEPTED WITHOUT CI AI REVIEW'],
    ERROR: ['❌', 'REVIEW FAILED'],
  }[decision];
}

export function classifyReview({ mode, policyResult, reviewResult, rawDecision,
  ownerAdditionSelected = false, ownerAdditionResult = 'skipped', ownerAdditionEligibility = '', ownerAdditionProcedure = null }) {
  if (policyResult !== 'success') {
    return { conclusion: 'ERROR', summary: 'Architecture Gate could not resolve the protected base-branch policy.', decision: null };
  }
  if (mode === 'local-only') {
    return { conclusion: 'WAIVED', summary: 'The protected base-branch policy explicitly waives the CI AI review.', decision: null };
  }
  if (mode !== 'enforced' && mode !== 'advisory') {
    return { conclusion: 'ERROR', summary: 'Architecture Gate resolved an unsupported policy mode.', decision: null };
  }
  if (reviewResult !== 'success') {
    return { conclusion: 'ERROR', summary: 'The model-backed architecture review did not complete successfully.', decision: null };
  }
  try {
    const decision = JSON.parse(rawDecision);
    if (!decision || !DECISIONS.has(decision.decision)) {
      throw new Error('missing or unsupported decision');
    }
    const summary = typeof decision.summary === 'string' && decision.summary.trim()
      ? decision.summary
      : 'No summary was supplied by the architecture reviewer.';
    const nestedBlock = decision.gates && typeof decision.gates === 'object' && !Array.isArray(decision.gates) &&
      Object.values(decision.gates).some(gate => gate?.decision === 'BLOCK');
    const eligibleAddition = decision.decision === 'OWNER_DECISION' && !nestedBlock &&
        ownerAdditionSelected && ownerAdditionResult === 'success' && ownerAdditionEligibility === 'ELIGIBLE' &&
        ownerAdditionProcedure?.procedure === 'VALID_G0_OWNER_ADDITION' &&
        decision.ownerDecisionId === ownerAdditionProcedure.missingDecisionId;
    if (mode === 'advisory') {
      return { conclusion: 'ADVISORY_ONLY',
        summary: eligibleAddition
          ? 'The recorded-base advisory procedure and separate missing-decision eligibility review completed. This is not merge acceptance.'
          : `The advisory procedure did not establish an eligible owner addition. Ordinary semantic decision: ${decision.decision}. This is not merge acceptance.`,
        decision, procedureEligibility: eligibleAddition ? 'eligible' : 'ineligible' };
    }
    if (eligibleAddition) {
      return { conclusion: 'OWNER_ADDITION_G0',
        summary: 'The previous protected policy selected G0; the exact B tag procedure and separate missing-decision eligibility review completed.',
        decision };
    }
    return { conclusion: decision.decision, summary, decision };
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
  if (classified.conclusion === 'ADVISORY_ONLY' && !/^[a-f0-9]{64}$/.test(metadata.policySha256 || '')) {
    throw new Error('Advisory report requires the recorded-base policy digest.');
  }
  const [icon, label] = labelFor(classified.conclusion);
  const decision = classified.decision;
  const decisionDigest = metadata.decisionDigest || digestDecision(decision);
  let body = `## ${icon} Architecture Gate — ${label}\n\n> ${cleanText(classified.summary)}\n`;
  if (classified.conclusion === 'OWNER_DECISION') {
    body += `\nThis result is not accepted by the current run. The accountable owner must make the unresolved architecture decision, record it in canonical consumer-owned authority, and rerun the gate against that updated authority. [How to handle OWNER_DECISION](${OWNER_INTERVENTION_URL}#owner_decision).\n`;
  } else if (classified.conclusion === 'ERROR') {
    const runReference = metadata.runUrl ? `[Actions run](${cleanText(metadata.runUrl, 1_000)})` : 'Actions run';
    body += `\nInspect the ${runReference} to identify the cause. If the CI reviewer is unavailable because of API, billing, model, credential, or service failure, follow [CI review unavailable](${OWNER_INTERVENTION_URL}#ci-review-unavailable). This result is not a PASS.\n`;
  }
  if (classified.conclusion === 'OWNER_ADDITION_G0') {
    const p = metadata.ownerAdditionProcedure;
    body += '\nThis is a procedural acceptance result for authority-only B, not semantic PASS for B or A. Tag actor or owner identity was not authenticated. A requires a fresh review after B becomes canonical. A later tag-ref change is not covered by this check.\n';
    if (p) body += `\nProtected policy/base: \`${cleanText(p.policyRevision, 64)}\` · B head: \`${cleanText(p.headSha, 64)}\` · Authority: \`${cleanText(p.authorityId, 64)}\` (\`${cleanText(p.authorityPath, 240)}\`) · Authority SHA-256: \`${cleanText(p.previousAuthoritySha256, 64)}\` → \`${cleanText(p.newAuthoritySha256, 64)}\` · Missing decision: \`${cleanText(p.missingDecisionId, 100)}\` · Tag ref observed: \`${cleanText(p.tagRef, 150)}\` → object OID \`${cleanText(p.tagObjectOid, 64)}\` · Principal authentication: \`not_verified\`\n`;
  }
  if (classified.conclusion === 'ADVISORY_ONLY') {
    const p = metadata.ownerAdditionProcedure;
    body += `\nThis informational report does not accept B or A and cannot satisfy Architecture Gate / accept. Ordinary semantic decision: \`${cleanText(decision?.decision, 100)}\` · Procedure eligibility: \`${cleanText(classified.procedureEligibility, 100)}\` · policyProtection=\`not_claimed\` · hostEnforcement=\`not_verified\` · canonicalTransition=\`not_verified\` · principalAuthentication=\`not_verified\`.\n`;
    body += `\nReport version: \`2\` · Repository: \`${cleanText(p?.repository || metadata.repository, 150)}\` · Recorded base and policy revision: \`${cleanText(p?.baseSha || metadata.baseSha, 64)}\` · Policy SHA-256: \`${cleanText(metadata.policySha256, 64)}\` · Candidate head: \`${cleanText(p?.headSha || metadata.headSha, 64)}\`\n`;
    if (p) body += `\nProcedure: \`${cleanText(p.procedure, 100)}\` · Authority: \`${cleanText(p.authorityId, 64)}\` (\`${cleanText(p.authorityPath, 240)}\`) · Authority SHA-256: \`${cleanText(p.previousAuthoritySha256, 64)}\` → \`${cleanText(p.newAuthoritySha256, 64)}\` · Missing decision: \`${cleanText(p.missingDecisionId, 100)}\` · Tag object OID: \`${cleanText(p.tagObjectOid, 64)}\`\n`;
  }
  if (metadata.authorityProvenance) {
    const selected = metadata.authorityProvenance;
    body += `\n**Selected Authority Set**\n\nManifest SHA-256: \`${cleanText(selected.manifestSha256, 64)}\` · Set SHA-256: \`${cleanText(selected.setDigest, 64)}\`\n`;
    body += renderList('Resolved members', selected.members.map(member => `${member.id}: ${member.repository}@${member.resolvedCommit}:${member.path} (SHA-256 ${member.sha256})`));
  }
  body += renderGates(decision?.gates);
  if (decision) {
    const context = [
      renderList('Reviewed scope', decision.reviewedScope),
      renderList('Governing authority', decision.authority),
      renderList('Authority files', decision.authorityFiles),
      renderList('Authority IDs', decision.authorityIds),
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
  if (metadata.headSha) links.push(`PR head: \`${cleanText(metadata.headSha, 64)}\``);
  if (decisionDigest) links.push(`Decision SHA-256: \`${cleanText(decisionDigest, 64)}\``);
  if (metadata.runUrl) links.push(`[Actions run](${cleanText(metadata.runUrl, 1_000)})`);
  if (metadata.workflowRef) links.push(`Workflow: \`${cleanText(metadata.workflowRef, 300)}\``);
  const provenance = links.length ? `\n${links.join(' · ')}\n` : '';
  const marker = metadata.mode === 'advisory' || classified.conclusion === 'ADVISORY_ONLY'
    ? ADVISORY_COMMENT_MARKER : COMMENT_MARKER;
  const ending = `${provenance}\n${marker}\n`;
  const truncation = '\n\n_Report truncated._\n';
  if (body.length + ending.length > MAX_REPORT_LENGTH) {
    body = `${body.slice(0, Math.max(0, MAX_REPORT_LENGTH - ending.length - truncation.length))}${truncation}`;
  }
  return `${body}${ending}`;
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
  let commentsUrl = `${root}/issues/${pullRequest}/comments?per_page=100`;
  let existing;
  const marker = body.includes(ADVISORY_COMMENT_MARKER) ? ADVISORY_COMMENT_MARKER : COMMENT_MARKER;
  while (commentsUrl) {
    const listed = await fetchImpl(commentsUrl, { headers });
    if (!listed.ok) throw new Error(`list comments returned HTTP ${listed.status}`);
    const comments = await listed.json();
    existing = comments.find((comment) => comment?.user?.login === 'github-actions[bot]' && comment?.body?.includes(marker));
    if (existing) break;
    const link = listed.headers?.get?.('link') || '';
    commentsUrl = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] || '';
  }
  const url = existing ? `${root}/issues/comments/${existing.id}` : `${root}/issues/${pullRequest}/comments`;
  const response = await fetchImpl(url, { method: existing ? 'PATCH' : 'POST', headers, body: JSON.stringify({ body }) });
  if (!response.ok) throw new Error(`${existing ? 'update' : 'create'} comment returned HTTP ${response.status}`);
  return { status: existing ? 'updated' : 'created' };
}

async function main() {
  const ordinary = classifyReview({
    mode: process.env.MODE, policyResult: process.env.POLICY_RESULT,
    reviewResult: process.env.REVIEW_RESULT, rawDecision: process.env.DECISION || '',
  });
  const requiresAdditionProcedure = ordinary.conclusion === 'OWNER_DECISION' &&
    process.env.OWNER_ADDITION_SELECTED === 'true' && process.env.OWNER_ADDITION_RESULT === 'success' &&
    process.env.OWNER_ADDITION_ELIGIBILITY === 'ELIGIBLE';
  const ownerAdditionProcedure = requiresAdditionProcedure
    ? parseOwnerAdditionProcedure(process.env.OWNER_ADDITION_PROCEDURE_BASE64, true) : null;
  if (ownerAdditionProcedure && (ownerAdditionProcedure.repository !== process.env.GITHUB_REPOSITORY ||
      ownerAdditionProcedure.baseSha !== process.env.BASE_SHA ||
      ownerAdditionProcedure.headSha !== process.env.HEAD_SHA)) {
    throw new Error('G0 owner-addition procedure does not match this pull request.');
  }
  const classified = classifyReview({
    mode: process.env.MODE,
    policyResult: process.env.POLICY_RESULT,
    reviewResult: process.env.REVIEW_RESULT,
    rawDecision: process.env.DECISION || '',
    ownerAdditionSelected: process.env.OWNER_ADDITION_SELECTED === 'true',
    ownerAdditionResult: process.env.OWNER_ADDITION_RESULT,
    ownerAdditionEligibility: process.env.OWNER_ADDITION_ELIGIBILITY,
    ownerAdditionProcedure,
  });
  const report = renderReport(classified, {
    mode: process.env.MODE,
    repository: process.env.GITHUB_REPOSITORY,
    baseSha: process.env.BASE_SHA,
    policySha256: process.env.POLICY_SHA256,
    reviewedSha: process.env.REVIEWED_SHA,
    headSha: process.env.HEAD_SHA,
    runUrl: process.env.RUN_URL,
    workflowRef: process.env.WORKFLOW_REF,
    authorityProvenance: parseAuthorityProvenance(process.env.AUTHORITY_PROVENANCE_BASE64,
      process.env.AUTHORITY_ROUTE_SELECTED === 'true' && process.env.REVIEW_RESULT === 'success'),
    ownerAdditionProcedure,
  });
  const decisionDigest = digestDecision(classified.decision);
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
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `conclusion=${classified.conclusion}\ndecision_digest=${decisionDigest}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
