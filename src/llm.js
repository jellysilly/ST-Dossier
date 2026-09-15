/**
 * Слой обращения к модели.
 *
 * Два режима:
 *   'main'    — тот же бэкенд, что и чат, но через generateRaw: в запрос уходит
 *               только наш фрагмент, без истории чата и карточки персонажа.
 *   'profile' — отдельный профиль подключения (Connection Profiles), чтобы
 *               разбор шёл дешёвой моделью и не тратил контекст основной.
 */

import { getSettings } from './settings.js';

function ctx() { return SillyTavern.getContext(); }

/** Доступен ли менеджер профилей подключения. */
export function profilesAvailable() {
    try {
        const c = ctx();
        if (!c.ConnectionManagerRequestService) return false;
        if (c.extensionSettings?.disabledExtensions?.includes('connection-manager')) return false;
        return Array.isArray(c.extensionSettings?.connectionManager?.profiles);
    } catch { return false; }
}

/** @returns {{id: string, name: string}[]} */
export function listProfiles() {
    if (!profilesAvailable()) return [];
    try {
        return ctx().ConnectionManagerRequestService.getSupportedProfiles()
            .map(p => ({ id: p.id, name: p.name || p.id }));
    } catch { return []; }
}

/**
 * Один запрос к модели.
 * @param {{system: string, user: string, maxTokens?: number, signal?: AbortSignal}} params
 * @returns {Promise<string>}
 */
export async function complete({ system, user, maxTokens, signal }) {
    const s = getSettings();
    const limit = Number(maxTokens || s.maxTokens) || 900;

    if (s.apiMode === 'profile' && s.profileId && profilesAvailable()) {
        return await viaProfile({ system, user, limit, profileId: s.profileId, signal });
    }
    return await viaMainApi({ system, user, limit });
}

async function viaProfile({ system, user, limit, profileId, signal }) {
    const c = ctx();
    const CMRS = c.ConnectionManagerRequestService;
    const s = getSettings();

    const messages = [
        { role: 'system', content: system },
        { role: 'user', content: user },
    ];

    // Для text completion профиля это вернёт готовую строку с instruct-разметкой,
    // для chat completion — тот же массив сообщений.
    let prompt = messages;
    try { prompt = CMRS.constructPrompt(messages, profileId); }
    catch { /* профиль без instruct — шлём как есть */ }

    const res = await CMRS.sendRequest(profileId, prompt, limit, {
        stream: false,
        extractData: true,
        includePreset: !!s.usePreset,
        includeInstruct: true,
        signal: signal ?? null,
    });

    if (typeof res === 'string') return res;
    return String(res?.content ?? '');
}

async function viaMainApi({ system, user, limit }) {
    const c = ctx();
    const params = {
        prompt: user,
        systemPrompt: system,
        responseLength: limit,
        instructOverride: false,
        quietToLoud: false,
        trimNames: true,
    };
    try {
        return String(await c.generateRaw(params) ?? '');
    } catch (err) {
        // Очень старые сборки ST принимали только позиционные аргументы.
        if (err instanceof TypeError) {
            return String(await c.generateRaw(user, null, false, false, system, limit) ?? '');
        }
        throw err;
    }
}

/**
 * Достаёт JSON из ответа модели: снимает ```-ограждения, отрезает болтовню
 * до первой скобки и после парной ей закрывающей.
 * @returns {any|null}
 */
export function parseJsonLoose(raw) {
    if (!raw) return null;
    let text = String(raw).trim();

    // блоки ```json ... ```
    const fence = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();

    const direct = tryParse(text);
    if (direct) return direct;

    // ищем сбалансированный объект или массив
    for (const [open, close] of [['{', '}'], ['[', ']']]) {
        const start = text.indexOf(open);
        if (start === -1) continue;
        let depth = 0, inStr = false, esc = false;
        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (ch === open) depth++;
            else if (ch === close) {
                depth--;
                if (depth === 0) {
                    const found = tryParse(text.slice(start, i + 1));
                    if (found) return found;
                    break;
                }
            }
        }
    }
    return null;
}

function tryParse(s) {
    try { return JSON.parse(s); } catch { /* не JSON */ }
    // частая беда мелких моделей — висячие запятые
    try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
}
