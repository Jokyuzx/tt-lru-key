// Pure helpers, no TauriTavern imports, so they can be unit-tested in Node.

/**
 * Map a chat completion payload to its secret key (e.g. "api_key_custom").
 * Mirrors resolveSecretKey() in secrets.js, but reads the outgoing payload
 * instead of the UI state, so it matches the request actually being sent.
 * @param {Record<string, any>} payload generate_data
 * @param {Record<string, string>} sources chat_completion_sources
 * @param {Record<string, string>} secretKeys SECRET_KEYS
 * @returns {string|null}
 */
export function secretKeyForPayload(payload, sources, secretKeys) {
    const source = payload?.chat_completion_source;
    if (!source) return null;

    if (source === sources.VERTEXAI) {
        if (payload.vertexai_auth_mode === 'express') return secretKeys.VERTEXAI ?? null;
        if (payload.vertexai_auth_mode === 'full') return secretKeys.VERTEXAI_SERVICE_ACCOUNT ?? null;
    }

    const name = Object.keys(sources).find((k) => sources[k] === source);
    return (name && secretKeys[name]) || null;
}

/**
 * Pick the least recently used secret. Never-used secrets count as 0,
 * ties go to the earlier entry in the list.
 * @param {{id: string}[]} secrets
 * @param {Record<string, number>} lastUsed id -> timestamp
 * @returns {{id: string}|null}
 */
export function pickLeastRecentlyUsed(secrets, lastUsed) {
    let best = null;
    let bestTime = Infinity;
    for (const secret of secrets) {
        if (!secret?.id) continue;
        const time = lastUsed[secret.id] ?? 0;
        if (time < bestTime) {
            best = secret;
            bestTime = time;
        }
    }
    return best;
}

/**
 * Keep only the secrets meant for this endpoint. The Custom source shares one
 * key pool (api_key_custom) across all endpoints, so keys are told apart by a
 * label prefix configured per host.
 * @param {{id: string, label?: string}[]} secrets
 * @param {string} endpoint e.g. payload.custom_url
 * @param {Record<string, string>} prefixByHost host -> label prefix
 * @returns {{id: string, label?: string}[]|null} null when the host is unknown or the URL is invalid
 */
export function filterByEndpoint(secrets, endpoint, prefixByHost) {
    let host;
    try {
        host = new URL(endpoint).host;
    } catch {
        return null;
    }
    if (!prefixByHost || !Object.hasOwn(prefixByHost, host)) return null;
    const prefix = prefixByHost[host];
    return secrets.filter((s) => typeof s?.label === 'string' && s.label.startsWith(prefix));
}

/**
 * Drop timestamps of secrets that no longer exist.
 * @param {Record<string, number>} lastUsed
 * @param {Record<string, {id: string}[]|null>} secretState
 */
export function pruneLastUsed(lastUsed, secretState) {
    const alive = new Set();
    for (const list of Object.values(secretState ?? {})) {
        if (Array.isArray(list)) list.forEach((s) => s?.id && alive.add(s.id));
    }
    for (const id of Object.keys(lastUsed)) {
        if (!alive.has(id)) delete lastUsed[id];
    }
}
