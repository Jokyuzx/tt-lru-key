// LRU key rotation for TauriTavern.
// Before every chat completion request, pick the least recently used saved key
// of the current source and send its id as generate_data.secret_id. The Rust
// backend then reads that key instead of the active one. Key values are never
// read, so allowKeysExposure is not needed, and secrets.json is never rewritten.
//
// The Custom source keeps one shared pool (api_key_custom) for every endpoint,
// so for Custom only keys whose label starts with the prefix mapped to the
// endpoint host are rotated. Unknown hosts fall back to the active key.

import { secret_state, SECRET_KEYS } from '../../../secrets.js';
import { chat_completion_sources } from '../../../openai.js';
import { filterByEndpoint, pickLeastRecentlyUsed, pruneLastUsed, secretKeyForPayload } from './lru.js';

const MODULE = 'tt-lru-key';
const { eventSource, eventTypes, extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();

// Persisted in settings.json, so the rotation order survives restarts.
extensionSettings[MODULE] ??= {};
extensionSettings[MODULE].lastUsed ??= {};
extensionSettings[MODULE].prefixByHost ??= { 'gcli.ggchan.dev': 'GG-' };
const settings = extensionSettings[MODULE];
const lastUsed = settings.lastUsed;

eventSource.on(eventTypes.CHAT_COMPLETION_SETTINGS_READY, (payload) => {
    // A connection profile that pins a specific key wins.
    if (typeof payload?.secret_id === 'string' && payload.secret_id.trim()) return;

    const key = secretKeyForPayload(payload, chat_completion_sources, SECRET_KEYS);
    let secrets = key ? secret_state[key] : null;
    if (!Array.isArray(secrets)) return;

    if (payload.chat_completion_source === chat_completion_sources.CUSTOM) {
        // Shared pool: only rotate keys labelled for this endpoint; even a single
        // match is pinned, so another service's key is never sent here.
        secrets = filterByEndpoint(secrets, payload.custom_url, settings.prefixByHost);
        if (!secrets?.length) return;
    } else if (secrets.length < 2) {
        return;
    }

    const picked = pickLeastRecentlyUsed(secrets, lastUsed);
    if (!picked) return;

    payload.secret_id = picked.id;
    lastUsed[picked.id] = Date.now();
    pruneLastUsed(lastUsed, secret_state);
    saveSettingsDebounced();
    console.info(`[${MODULE}] ${key} -> ${picked.label || picked.id}`);
});
