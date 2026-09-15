/**
 * Возврат памяти в разговор: собранные факты и текущее время
 * вставляются в промпт как системная заметка на заданной глубине.
 */

import { getSettings } from './settings.js';
import { getCase } from './store.js';
import { clockSummary } from './timeline.js';

const KEY = 'DOSSIER_MEMORY';
const IN_CHAT = 1;
const ROLE_SYSTEM = 0;

/** Отбираем самое весомое: закреплённое, затем важное, затем свежее. */
function pickFacts(facts, limit) {
    const scored = [...facts].sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
        if (b.importance !== a.importance) return b.importance - a.importance;
        return (b.createdAt || 0) - (a.createdAt || 0);
    }).slice(0, limit);

    // в промпт отдаём по порядку сюжета, так модели проще
    return scored.sort((a, b) => (a.msgStart ?? 1e9) - (b.msgStart ?? 1e9));
}

export function buildMemoryText() {
    const s = getSettings();
    const c = getCase();
    const lines = [];

    if (s.trackTime) {
        const clock = clockSummary(c.clock, s.startDate);
        if (clock) lines.push('Время: ' + clock);
    }

    const facts = pickFacts(c.facts, s.injectMaxFacts);
    if (facts.length) {
        lines.push('Установленные факты:');
        for (const f of facts) lines.push('- ' + f.text);
    }

    if (!lines.length) return '';
    return `${s.injectHeader}\n${lines.join('\n')}`;
}

export function refreshInjection() {
    const ctx = SillyTavern.getContext();
    const s = getSettings();

    if (!s.enabled || !s.inject) {
        ctx.setExtensionPrompt(KEY, '', IN_CHAT, 0, false, ROLE_SYSTEM);
        return;
    }

    const text = buildMemoryText();
    ctx.setExtensionPrompt(KEY, text, IN_CHAT, Number(s.injectDepth) || 4, false, ROLE_SYSTEM);
}

export function clearInjection() {
    SillyTavern.getContext().setExtensionPrompt(KEY, '', IN_CHAT, 0, false, ROLE_SYSTEM);
}
