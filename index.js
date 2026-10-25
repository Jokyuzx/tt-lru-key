// LRU key rotation for TauriTavern.
// Before every chat completion request, pick the least recently used saved key
// of the current source and send its id as generate_data.secret_id. The Rust
// backend then reads that key instead of the active one. Key values are never
// read, so allowKeysExposure is not needed, and secrets.json is never rewritten.

import { secret_state, SECRET_KEYS } from '../../../secrets.js';
import { chat_completion_sources } from '../../../openai.js';
import { pickLeastRecentlyUsed, pruneLastUsed, secretKeyForPayload } from './lru.js';

const MODULE = 'tt-lru-key';
const { eventSource, eventTypes, extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();

// Persisted in settings.json, so the rotation order survives restarts.
extensionSettings[MODULE] ??= {};
extensionSettings[MODULE].lastUsed ??= {};
const lastUsed = extensionSettings[MODULE].lastUsed;

eventSource.on(eventTypes.CHAT_COMPLETION_SETTINGS_READY, (payload) => {
    // A connection profile that pins a specific key wins.
    if (typeof payload?.secret_id === 'string' && payload.secret_id.trim()) return;

    const key = secretKeyForPayload(payload, chat_completion_sources, SECRET_KEYS);
    const secrets = key ? secret_state[key] : null;
    if (!Array.isArray(secrets) || secrets.length < 2) return;

    const picked = pickLeastRecentlyUsed(secrets, lastUsed);
    if (!picked) return;

    payload.secret_id = picked.id;
    lastUsed[picked.id] = Date.now();
    pruneLastUsed(lastUsed, secret_state);
    saveSettingsDebounced();
    console.info(`[${MODULE}] ${key} -> ${picked.label || picked.id}`);
});
