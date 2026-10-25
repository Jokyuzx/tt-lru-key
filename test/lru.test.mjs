import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLeastRecentlyUsed, pruneLastUsed, secretKeyForPayload } from '../lru.js';

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
