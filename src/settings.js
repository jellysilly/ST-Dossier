/** Глобальные настройки расширения: живут в extension_settings и общие для всех чатов. */

export const MODULE = 'dossier';

export const DEFAULTS = {
    enabled: true,

    // Источник разбора
    apiMode: 'main',          // 'main' — тот же API, что и чат; 'profile' — отдельный профиль
    profileId: '',
    usePreset: false,         // тянуть ли сэмплеры из пресета профиля
    maxTokens: 900,

    // Разбор
    autoScan: true,
    everyN: 6,                // запускать разбор, накопив N новых сообщений
    maxMessages: 20,          // сколько сообщений максимум уходит в один запрос
    maxChars: 1600,           // обрезка одного сообщения
    minImportance: 2,         // факты ниже — отбрасываются
    scanDelayMs: 1500,

    // Хронология
    trackTime: true,
    startDate: '',

    // Возврат памяти в промпт
    inject: true,
    injectDepth: 4,
    injectMaxFacts: 18,
    injectHeader: '[Память сцен и хронология — известные факты, не пересказывай их дословно]',

    // Интерфейс
    animations: true,
    lang: 'auto',
    posX: null,
    posY: null,
    openPage: 'archive',
};

/** @returns {typeof DEFAULTS} */
export function getSettings() {
    const ctx = SillyTavern.getContext();
    const all = ctx.extensionSettings;
    if (!all[MODULE]) all[MODULE] = structuredClone(DEFAULTS);
    // добираем ключи, появившиеся в новых версиях
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (all[MODULE][k] === undefined) all[MODULE][k] = v;
    }
    return all[MODULE];
}

export function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
}

export function setSetting(key, value) {
    getSettings()[key] = value;
    saveSettings();
}
