import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterByEndpoint, pickLeastRecentlyUsed, pruneLastUsed, secretKeyForPayload } from '../lru.js';

const sources = { OPENAI: 'openai', CLAUDE: 'claude', CUSTOM: 'custom', VERTEXAI: 'vertexai' };
const keys = {
    OPENAI: 'api_key_openai',
    CLAUDE: 'api_key_claude',
    CUSTOM: 'api_key_custom',
    VERTEXAI: 'api_key_vertexai',
    VERTEXAI_SERVICE_ACCOUNT: 'vertexai_service_account_json',
};

test('maps payload source to secret key', () => {
    assert.equal(secretKeyForPayload({ chat_completion_source: 'custom' }, sources, keys), 'api_key_custom');
    assert.equal(secretKeyForPayload({ chat_completion_source: 'claude' }, sources, keys), 'api_key_claude');
    assert.equal(secretKeyForPayload({ chat_completion_source: 'vertexai', vertexai_auth_mode: 'full' }, sources, keys), 'vertexai_service_account_json');
    assert.equal(secretKeyForPayload({ chat_completion_source: 'nope' }, sources, keys), null);
    assert.equal(secretKeyForPayload({}, sources, keys), null);
});

test('rotates through keys in LRU order', () => {
    const secrets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const lastUsed = {};
    const order = [];
    for (let t = 1; t <= 6; t++) {
        const picked = pickLeastRecentlyUsed(secrets, lastUsed);
        order.push(picked.id);
        lastUsed[picked.id] = t;
    }
    assert.deepEqual(order, ['a', 'b', 'c', 'a', 'b', 'c']);
});

test('newly added key is used next', () => {
    const lastUsed = { a: 5, b: 6 };
    const picked = pickLeastRecentlyUsed([{ id: 'a' }, { id: 'b' }, { id: 'new' }], lastUsed);
    assert.equal(picked.id, 'new');
});

test('prunes deleted keys', () => {
    const lastUsed = { a: 1, gone: 2 };
    pruneLastUsed(lastUsed, { api_key_custom: [{ id: 'a' }], api_key_claude: null });
    assert.deepEqual(lastUsed, { a: 1 });
});

const pool = [
    { id: 'g1', label: 'GG-1' },
    { id: 'g2', label: 'GG-2' },
    { id: 'y1', label: 'yy-main' },
    { id: 'n1' },
];
const prefixes = { 'gcli.ggchan.dev': 'GG-' };

test('filterByEndpoint: host hit keeps only prefixed labels', () => {
    const out = filterByEndpoint(pool, 'https://gcli.ggchan.dev/v1', prefixes);
    assert.deepEqual(out.map((s) => s.id), ['g1', 'g2']);
});

test('filterByEndpoint: unknown host returns null', () => {
    assert.equal(filterByEndpoint(pool, 'https://www.yyapi.cloud/v1', prefixes), null);
});

test('filterByEndpoint: invalid URL returns null', () => {
    assert.equal(filterByEndpoint(pool, 'not a url', prefixes), null);
    assert.equal(filterByEndpoint(pool, '', prefixes), null);
    assert.equal(filterByEndpoint(pool, undefined, prefixes), null);
});

test('filterByEndpoint: secrets without label are skipped', () => {
    const out = filterByEndpoint([{ id: 'n1' }, { id: 'n2', label: null }, { id: 'g1', label: 'GG-1' }], 'https://gcli.ggchan.dev/v1', prefixes);
    assert.deepEqual(out.map((s) => s.id), ['g1']);
});

test('filterByEndpoint: host match only, no prefix match gives empty array', () => {
    assert.deepEqual(filterByEndpoint([{ id: 'y1', label: 'yy-main' }], 'https://gcli.ggchan.dev/v1', prefixes), []);
});
