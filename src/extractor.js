/**
 * Разбор диалога: что произошло, кто участвовал, сколько времени прошло.
 * Работает порциями — в модель уходит только неразобранный хвост чата.
 */

import { getSettings } from './settings.js';
import { getCase, saveCase, uid, clampCursor } from './store.js';
import { complete, parseJsonLoose } from './llm.js';
import { buildExtractionPrompt, buildTranscript, SYSTEM_PROMPT } from './prompts.js';
import { clockSummary, sanitizeAdvance } from './timeline.js';

export const bus = new EventTarget();
const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

let busy = false;
export const isBusy = () => busy;

const KINDS = ['event', 'fact', 'relation', 'place', 'item', 'promise', 'secret'];

/* ------------------------------------------------------------------ утилиты */

function normalize(s) {
    return String(s).toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Грубое усечение основы. Без этого русские падежи ломают сравнение:
 * «содержимом» и «содержимого» считались бы разными словами, и один и тот же
 * факт попадал бы в дело дважды.
 */
function stem(word) {
    return word.length > 5 ? word.slice(0, 5) : word;
}

function keyTokens(s) {
    return new Set(
        normalize(s).split(' ').filter(w => w.length > 3).map(stem),
    );
}

/** Мера похожести двух формулировок — чтобы не плодить дубли одного события. */
function similarity(a, b) {
    const A = keyTokens(a), B = keyTokens(b);
    if (!A.size || !B.size) return normalize(a) === normalize(b) ? 1 : 0;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    return inter / (A.size + B.size - inter);
}

function isDuplicate(text, facts) {
    return facts.some(f => similarity(text, f.text) >= 0.6);
}

/* --------------------------------------------------------- сбор сообщений */

function collectMessages(from, to) {
    const chat = SillyTavern.getContext().chat || [];
    const out = [];
    for (let i = from; i < Math.min(to, chat.length); i++) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        const text = String(m.mes ?? '').trim();
        if (!text) continue;
        out.push({ index: i, name: m.name || (m.is_user ? 'User' : 'Character'), text });
    }
    return out;
}

/** Сколько сообщений ждёт разбора. */
export function pendingCount() {
    const chat = SillyTavern.getContext().chat || [];
    const c = getCase();
    return Math.max(0, chat.length - c.cursor);
}

/* ------------------------------------------------------------------- часы */

/**
 * Пересобираем часы из эпизодов. Так дозаписанный задним числом кусок
 * не ломает счётчик: порядок берётся из номеров сообщений, а не из порядка разбора.
 */
export function recomputeClock() {
    const c = getCase();
    const s = getSettings();
    const ordered = [...c.scenes].sort((a, b) => (a.msgStart ?? 0) - (b.msgStart ?? 0));
    c.clock.elapsedMinutes = ordered.reduce((sum, sc) => sum + (Number(sc.advanceMinutes) || 0), 0);
    const last = ordered[ordered.length - 1];
    if (last) {
        if (last.statedTime) c.clock.statedTime = last.statedTime;
        if (last.location) c.clock.location = last.location;
    }
    if (!c.clock.startDate && s.startDate) c.clock.startDate = s.startDate;
}

/* ------------------------------------------------------------- слияние */

function mergeResult(parsed, range) {
    const s = getSettings();
    const c = getCase();
    const added = [];

    const scene = parsed.scene && typeof parsed.scene === 'object' ? parsed.scene : {};
    const rawFacts = Array.isArray(parsed.facts) ? parsed.facts : [];
    const rawEntities = Array.isArray(parsed.entities) ? parsed.entities : [];

    const sceneId = uid();

    for (const f of rawFacts) {
        const text = String(f?.text ?? '').trim();
        if (!text || text.length < 3) continue;

        const importance = Math.min(5, Math.max(1, Math.round(Number(f?.importance) || 2)));
        if (importance < s.minImportance) continue;
        if (isDuplicate(text, c.facts)) continue;

        const kind = KINDS.includes(f?.kind) ? f.kind : 'event';
        const actors = Array.isArray(f?.actors)
            ? f.actors.map(a => String(a).trim()).filter(Boolean).slice(0, 6)
            : [];

        const fact = {
            id: uid(), text, kind, importance, actors,
            sceneId, msgStart: range.from, msgEnd: range.to - 1,
            createdAt: Date.now(), pinned: false,
        };
        c.facts.push(fact);
        added.push(fact);
    }

    // эпизод заводим, только если он что-то несёт
    const summary = String(scene.summary ?? '').trim();
    const title = String(scene.title ?? '').trim();
    const advance = s.trackTime ? sanitizeAdvance(scene.time_advance_minutes) : 0;

    if (added.length || summary || advance) {
        c.scenes.push({
            id: sceneId,
            title: title || summary.slice(0, 40) || `#${range.from}–${range.to - 1}`,
            summary,
            location: String(scene.location ?? '').trim(),
            statedTime: String(scene.stated_time ?? '').trim(),
            advanceMinutes: advance,
            msgStart: range.from,
            msgEnd: range.to - 1,
            factIds: added.map(f => f.id),
            createdAt: Date.now(),
        });
    }

    for (const e of rawEntities) {
        const name = String(e?.name ?? '').trim();
        if (!name) continue;
        const note = String(e?.note ?? '').trim();
        const kind = String(e?.kind ?? 'person').trim();
        const existing = c.entities.find(x => normalize(x.name) === normalize(name));
        if (existing) {
            existing.mentions = (existing.mentions || 1) + 1;
            if (note && !existing.notes.some(n => similarity(n, note) >= 0.7)) {
                existing.notes.push(note);
                if (existing.notes.length > 6) existing.notes.shift();
            }
        } else {
            c.entities.push({ id: uid(), name, kind, notes: note ? [note] : [], mentions: 1 });
        }
    }

    recomputeClock();
    return added;
}

/* ------------------------------------------------------------- один заход */

/**
 * Разбирает диапазон сообщений [from, to). Курсор не двигает.
 * @returns {Promise<object[]>} новые факты
 */
export async function scanRange(from, to) {
    const s = getSettings();
    const c = getCase();
    const messages = collectMessages(from, to);
    if (!messages.length) return [];

    const known = c.facts.slice(-24).map(f => '- ' + f.text).join('\n');
    const transcript = buildTranscript(messages, s.maxChars);

    let parsed = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        const user = buildExtractionPrompt({
            known,
            clock: clockSummary(c.clock, s.startDate),
            transcript,
            from: messages[0].index,
            to: messages[messages.length - 1].index,
            strict: attempt > 0,
        });
        const raw = await complete({ system: SYSTEM_PROMPT, user });
        parsed = parseJsonLoose(raw);
        if (!parsed) console.warn('[Dossier] ответ не распознан как JSON, попытка', attempt + 1, raw?.slice?.(0, 300));
    }

    if (!parsed) throw new Error('Модель не вернула JSON');
    return mergeResult(parsed, { from, to });
}

/**
 * Разбирает неразобранный хвост (одну порцию) и двигает курсор.
 * @returns {Promise<{added: object[], remaining: number}>}
 */
export async function scanNew() {
    const s = getSettings();
    const ctx = SillyTavern.getContext();
    if (!ctx.chat) throw new Error('no-chat');
    if (busy) throw new Error('busy');

    clampCursor();
    const c = getCase();
    const from = c.cursor;
    const to = Math.min(c.cursor + s.maxMessages, ctx.chat.length);
    if (to <= from) return { added: [], remaining: 0 };

    busy = true;
    emit('busy', { busy: true });
    try {
        const added = await scanRange(from, to);
        c.cursor = to;
        saveCase();
        emit('updated', { added });
        return { added, remaining: pendingCount() };
    } finally {
        busy = false;
        emit('busy', { busy: false });
    }
}

/**
 * Догоняет всю неразобранную историю порциями.
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function scanAll(onProgress) {
    let guard = 0;
    let total = pendingCount();
    let addedAll = [];
    while (pendingCount() > 0 && guard++ < 200) {
        const { added } = await scanNew();
        addedAll = addedAll.concat(added);
        onProgress?.(total - pendingCount(), total);
    }
    return addedAll;
}

/**
 * Разбор архива — истории, которую пропустили при подключении к старому чату.
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function backfill(onProgress) {
    const s = getSettings();
    const c = getCase();
    const limit = c.cursor;
    let pos = Number(c.backfilled) || 0;
    if (pos >= limit) return [];

    busy = true;
    emit('busy', { busy: true });
    let added = [];
    try {
        let guard = 0;
        while (pos < limit && guard++ < 200) {
            const to = Math.min(pos + s.maxMessages, limit);
            added = added.concat(await scanRange(pos, to));
            pos = to;
            c.backfilled = pos;
            saveCase();
            onProgress?.(pos, limit);
        }
        emit('updated', { added });
        return added;
    } finally {
        busy = false;
        emit('busy', { busy: false });
    }
}

export function skippedCount() {
    const c = getCase();
    return Math.max(0, (Number(c.skipped) || 0) - (Number(c.backfilled) || 0));
}

/* --------------------------------------------------- ручные правки дела */

export function addManualFact(text, kind = 'fact', importance = 3) {
    const c = getCase();
    const fact = {
        id: uid(), text: String(text).trim(), kind, importance,
        actors: [], sceneId: null, msgStart: null, msgEnd: null,
        createdAt: Date.now(), pinned: true, manual: true,
    };
    c.facts.push(fact);
    saveCase();
    emit('updated', { added: [fact] });
    return fact;
}

export function updateFact(id, patch) {
    const c = getCase();
    const f = c.facts.find(x => x.id === id);
    if (!f) return null;
    Object.assign(f, patch);
    saveCase();
    emit('updated', { added: [] });
    return f;
}

export function deleteFact(id) {
    const c = getCase();
    const i = c.facts.findIndex(x => x.id === id);
    if (i === -1) return false;
    c.facts.splice(i, 1);
    saveCase();
    emit('updated', { added: [] });
    return true;
}

export function deleteScene(id) {
    const c = getCase();
    const i = c.scenes.findIndex(x => x.id === id);
    if (i === -1) return false;
    c.scenes.splice(i, 1);
    c.facts = c.facts.filter(f => f.sceneId !== id);
    recomputeClock();
    saveCase();
    emit('updated', { added: [] });
    return true;
}

export function notifyUpdated() {
    emit('updated', { added: [] });
}
