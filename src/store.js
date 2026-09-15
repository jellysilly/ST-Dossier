/**
 * Данные дела. Хранятся в метаданных чата, поэтому у каждого чата свой архив
 * и он уезжает вместе с экспортом чата.
 */

export const STORE_KEY = 'dossier_case';
const VERSION = 1;

function emptyCase() {
    return {
        version: VERSION,
        facts: [],
        scenes: [],
        entities: [],
        cursor: 0,                 // сколько сообщений уже разобрано
        clock: { elapsedMinutes: 0, statedTime: '', location: '', startDate: '' },
        updatedAt: 0,
    };
}

/** @returns {ReturnType<typeof emptyCase>} */
export function getCase() {
    const ctx = SillyTavern.getContext();
    const meta = ctx.chatMetadata;
    if (!meta) return emptyCase();
    if (!meta[STORE_KEY] || typeof meta[STORE_KEY] !== 'object') {
        meta[STORE_KEY] = emptyCase();
    }
    const c = meta[STORE_KEY];
    // страховка от порченых метаданных
    if (!Array.isArray(c.facts)) c.facts = [];
    if (!Array.isArray(c.scenes)) c.scenes = [];
    if (!Array.isArray(c.entities)) c.entities = [];
    if (!c.clock) c.clock = { elapsedMinutes: 0, statedTime: '', location: '', startDate: '' };
    if (typeof c.cursor !== 'number' || c.cursor < 0) c.cursor = 0;
    return c;
}

export function saveCase() {
    const ctx = SillyTavern.getContext();
    const c = getCase();
    c.updatedAt = Date.now();
    ctx.saveMetadataDebounced();
}

export function resetCase() {
    const ctx = SillyTavern.getContext();
    if (!ctx.chatMetadata) return;
    ctx.chatMetadata[STORE_KEY] = emptyCase();
    ctx.saveMetadataDebounced();
}

/** Курсор не должен уезжать за пределы чата после удаления сообщений или свайпов. */
export function clampCursor() {
    const ctx = SillyTavern.getContext();
    const len = Array.isArray(ctx.chat) ? ctx.chat.length : 0;
    const c = getCase();
    if (c.cursor > len) {
        c.cursor = len;
        return true;
    }
    return false;
}

export function uid() {
    try { return SillyTavern.getContext().uuidv4(); }
    catch { return 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
}

export function importCase(json) {
    const ctx = SillyTavern.getContext();
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || typeof data !== 'object') throw new Error('Неверный формат файла');
    const fresh = emptyCase();
    ctx.chatMetadata[STORE_KEY] = {
        ...fresh,
        ...data,
        version: VERSION,
        facts: Array.isArray(data.facts) ? data.facts : [],
        scenes: Array.isArray(data.scenes) ? data.scenes : [],
        entities: Array.isArray(data.entities) ? data.entities : [],
        clock: { ...fresh.clock, ...(data.clock || {}) },
    };
    ctx.saveMetadataDebounced();
}

export function exportCase() {
    return JSON.stringify(getCase(), null, 2);
}
