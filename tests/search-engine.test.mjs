import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSources, validatedClaims, searchWithEvidence, validateInput } from '../lib/search-engine.ts';

const excerpt = 'The official project documentation states that water freezes at zero degrees Celsius at standard atmospheric pressure.';
const rawSource = { title: 'Official documentation', url: 'https://example.org/science', content: excerpt };
const sources = selectSources({ results: [rawSource] }, 4);
const input = { query: 'น้ำแข็งเกิดที่อุณหภูมิเท่าไร', mode: 'short', keys: { tavily: 'test-tavily', gemini: 'test-gemini', groq: '' } };
const claim = { text: 'น้ำแข็งเกิดที่ 0 องศาเซลเซียส ภายใต้ความดันบรรยากาศมาตรฐาน', citations: [1], evidence: [{ sourceId: 1, quote: 'water freezes at zero degrees Celsius at standard atmospheric pressure' }] };
const draft = { status: 'answered', claims: [claim], uncertainties: [] };
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const gemini = data => json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } }] });
const groq = data => json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] });
const mockFetch = responses => { const calls = []; return { calls, fetch: async (url, init) => { calls.push({ url, ...init }); const next = responses.shift(); if (!next) throw new Error('Unexpected provider request'); return typeof next === 'function' ? next(url, init) : next; } }; };

test('requires valid keys, mode and question', () => {
  assert.throws(() => validateInput({ ...input, keys: {} }));
  assert.throws(() => validateInput({ ...input, mode: 'invented' }));
  assert.throws(() => validateInput({ ...input, keys: { ...input.keys, tavily: 'injected\r\nkey' } }));
});
test('bounds and sanitizes prior chat context', () => {
  const context = [{ question: 'old', answer: 'old answer' }, { question: 'previous', answer: 'answer' }, { question: 'latest', answer: 'answer' }];
  assert.deepEqual(validateInput({ ...input, context }).context.map(item => item.question), ['previous', 'latest']);
});
test('only real readable HTTP sources survive', () => {
  const result = selectSources({ results: [rawSource, rawSource, { ...rawSource, url: 'javascript:alert(1)' }, { ...rawSource, url: 'https://user:pass@example.com/' }, { ...rawSource, url: 'https://example.org/empty', content: '' }] }, 6);
  assert.equal(result.length, 1); assert.equal(result[0].url, rawSource.url);
});
test('fabricated citation IDs, URLs in prose, and fake quotes cannot enter the answer', () => {
  const result = validatedClaims({ claims: [claim, { ...claim, citations: [99] }, { ...claim, text: 'see https://fake.example' }, { ...claim, evidence: [{ sourceId: 1, quote: 'This quote does not appear in the source' }] }] }, 'long', sources);
  assert.deepEqual(result, [{ text: claim.text, citations: [1] }]);
});
test('normal answer uses one search and one model request, with no keys in result', async () => {
  const mock = mockFetch([json({ results: [rawSource] }), gemini(draft)]);
  const result = await searchWithEvidence(input, { fetch: mock.fetch, now: () => new Date('2026-10-16T08:00:00Z') });
  assert.equal(result.status, 'answered');
  assert.deepEqual(result.claims, [{ text: claim.text, citations: [1] }]);
  assert.equal(mock.calls.length, 2);
  assert.equal(JSON.stringify(result).includes('test-gemini'), false);
  assert.equal(JSON.parse(mock.calls[0].body).include_raw_content, false);
});
test('no evidence means no model call and an honest answer', async () => {
  const mock = mockFetch([json({ results: [] })]);
  const result = await searchWithEvidence(input, { fetch: mock.fetch });
  assert.equal(result.status, 'insufficient'); assert.deepEqual(result.claims, []); assert.equal(mock.calls.length, 1);
});
test('unsupported answer becomes insufficient while retaining source links', async () => {
  const mock = mockFetch([json({ results: [rawSource] }), gemini({ ...draft, claims: [{ ...claim, evidence: [] }] })]);
  const result = await searchWithEvidence(input, { fetch: mock.fetch });
  assert.equal(result.status, 'insufficient'); assert.deepEqual(result.claims, []); assert.equal(result.sources.length, 1);
});
test('model refusal is not a successful answer', async () => {
  const mock = mockFetch([json({ results: [rawSource] }), gemini({ status: 'insufficient', claims: [], uncertainties: ['ข้อมูลไม่พอ'] })]);
  const result = await searchWithEvidence({ ...input, mode: 'long' }, { fetch: mock.fetch });
  assert.equal(result.status, 'insufficient'); assert.equal(JSON.parse(mock.calls[0].body).max_results, 5);
});
test('follow-up context helps form the search query without becoming evidence', async () => {
  const mock = mockFetch([json({ results: [rawSource] }), gemini(draft)]);
  await searchWithEvidence({ ...input, query: 'แล้วปีนี้ล่ะ', context: [{ question: 'น้ำแข็งเกิดที่อุณหภูมิเท่าไร', answer: '0 องศา' }] }, { fetch: mock.fetch });
  assert.match(JSON.parse(mock.calls[0].body).query, /น้ำแข็งเกิดที่อุณหภูมิเท่าไร แล้วปีนี้ล่ะ/);
});
test('Gemini quota switches to Groq when supplied', async () => {
  const mock = mockFetch([json({ results: [rawSource] }), new Response('', { status: 429 }), groq(draft)]);
  const result = await searchWithEvidence({ ...input, keys: { ...input.keys, groq: 'test-groq' } }, { fetch: mock.fetch });
  assert.equal(result.status, 'answered'); assert.equal(mock.calls[2].url, 'https://api.groq.com/openai/v1/chat/completions');
});
test('truncated model output never becomes an answer', async () => {
  const mock = mockFetch([json({ results: [rawSource] }), json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(draft) }] } }] })]);
  await assert.rejects(() => searchWithEvidence(input, { fetch: mock.fetch }), /สมบูรณ์/);
});
test('provider redirects are not followed with credentials', async () => {
  const mock = mockFetch([new Response(null, { status: 302, headers: { Location: 'https://other.example/collect' } })]);
  await assert.rejects(() => searchWithEvidence(input, { fetch: mock.fetch }), /เปลี่ยนปลายทาง/);
  assert.equal(mock.calls[0].redirect, 'manual');
});

