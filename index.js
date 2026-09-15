/**
 * Dossier — память сцен и хронология для SillyTavern.
 *
 * Расширение читает диалог порциями, вытаскивает из него произошедшее,
 * ведёт внутриигровые часы и возвращает накопленное обратно в промпт.
 */

import { initLocale, T } from './src/i18n.js';
import { getSettings, saveSettings, MODULE } from './src/settings.js';
import { getCase, saveCase, clampCursor } from './src/store.js';
import { bus, scanNew, pendingCount, isBusy, recomputeClock } from './src/extractor.js';
import { refreshInjection, clearInjection } from './src/inject.js';
import { mountUI, refresh, toggleCase, openCase, runScan, onChatChanged } from './src/ui.js';
import { listProfiles, profilesAvailable } from './src/llm.js';
import { diagnose, mark, noteError } from './src/doctor.js';

// Доступно до всякой инициализации: если запуск оборвётся, диагностику
// всё равно можно вызвать из консоли браузера.
globalThis.dossierDoctor = diagnose;

const ctx = () => SillyTavern.getContext();

let scanTimer = null;
let generating = false;

/* --------------------------------------------------------------- автоматика */

function scheduleScan() {
    const s = getSettings();
    if (!s.enabled || !s.autoScan) return;
    if (pendingCount() < s.everyN) return;

    clearTimeout(scanTimer);
    scanTimer = setTimeout(async () => {
        if (generating || isBusy()) { scheduleScan(); return; }
        try {
            await scanNew();
        } catch (err) {
            if (err.message !== 'busy' && err.message !== 'no-chat') {
                console.error('[Dossier] авторазбор сорвался:', err);
            }
        }
    }, s.scanDelayMs);
}

/**
 * При подключении к чату, у которого уже есть длинная история, не бросаемся
 * разбирать её целиком — это дорого. Помечаем как пропущенное и предлагаем
 * разобрать вручную кнопкой в архиве.
 */
function adoptExistingChat() {
    const s = getSettings();
    const chat = ctx().chat || [];
    const c = getCase();

    if (c.cursor === 0 && c.facts.length === 0 && chat.length > s.maxMessages) {
        c.cursor = chat.length;
        c.skipped = chat.length;
        c.backfilled = 0;
        saveCase();
    }
}

/* ------------------------------------------------------------------ события */

function bindStEvents() {
    const { eventSource, eventTypes } = ctx();

    eventSource.on(eventTypes.CHAT_CHANGED, () => {
        clampCursor();
        adoptExistingChat();
        recomputeClock();
        refreshInjection();
        onChatChanged();
    });

    eventSource.on(eventTypes.GENERATION_STARTED, () => { generating = true; });
    eventSource.on(eventTypes.GENERATION_ENDED, () => { generating = false; });
    eventSource.on(eventTypes.GENERATION_STOPPED, () => { generating = false; });

    eventSource.on(eventTypes.MESSAGE_RECEIVED, () => { refresh(); scheduleScan(); });
    eventSource.on(eventTypes.MESSAGE_SENT, () => { refresh(); });

    // свайпы и удаления двигают границу разобранного
    for (const evt of [eventTypes.MESSAGE_DELETED, eventTypes.MESSAGE_SWIPED, eventTypes.MESSAGE_SWIPE_DELETED]) {
        eventSource.on(evt, () => { if (clampCursor()) saveCase(); refresh(); });
    }

    // память подмешивается заново перед каждой сборкой промпта
    eventSource.on(eventTypes.GENERATE_BEFORE_COMBINE_PROMPTS, () => refreshInjection());
    eventSource.on(eventTypes.CHAT_COMPLETION_PROMPT_READY, () => { /* уже вставлено */ });

    bus.addEventListener('updated', () => refresh());
}

/* ------------------------------------------------------------ slash-команды */

function registerCommands() {
    const c = ctx();
    const { SlashCommandParser, SlashCommand, SlashCommandArgument, ARGUMENT_TYPE } = c;
    if (!SlashCommandParser?.addCommandObject) return;

    const add = (name, callback, helpString, unnamed = []) => {
        try {
            SlashCommandParser.addCommandObject(SlashCommand.fromProps({
                name, callback, helpString, unnamedArgumentList: unnamed,
            }));
        } catch (err) { console.warn('[Dossier] команда', name, 'не зарегистрирована:', err); }
    };

    add('dossier', () => { toggleCase(); return ''; }, 'Открыть или закрыть дело.');
    add('dossier-scan', async () => { await runScan(); return ''; }, 'Разобрать неразобранные сообщения прямо сейчас.');
    add('dossier-open', () => { openCase(); return ''; }, 'Открыть дело.');
    add('dossier-doctor', () => diagnose(), 'Самодиагностика: почему папка не отзывается.');

    add('dossier-fact', async (_args, value) => {
        const text = String(value ?? '').trim();
        if (!text) return '';
        const { addManualFact } = await import('./src/extractor.js');
        addManualFact(text);
        return text;
    }, 'Вписать факт в дело вручную. Пример: /dossier-fact Ребекка солгала о поезде',
    SlashCommandArgument ? [SlashCommandArgument.fromProps({
        description: 'текст факта', typeList: [ARGUMENT_TYPE.STRING], isRequired: true,
    })] : []);
}

/* ------------------------------------- панель в меню расширений SillyTavern */

function mountSettingsPanel(attempt = 0) {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) {
        // Расширение грузится асинхронно; узел настроек мог ещё не появиться.
        if (attempt < 20) { setTimeout(() => mountSettingsPanel(attempt + 1), 500); return; }
        console.warn('[Dossier] контейнер настроек не найден, панель в меню не появится');
        return;
    }
    if (document.querySelector('.dsr-st-panel')) return;

    const s = getSettings();
    const wrap = document.createElement('div');
    wrap.className = 'dsr-st-panel';
    wrap.innerHTML = `
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>Dossier — ${T('caseFile')}</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <label class="checkbox_label">
          <input type="checkbox" id="dsr_enabled" ${s.enabled ? 'checked' : ''}>
          <span>Включить расширение</span>
        </label>
        <label class="checkbox_label">
          <input type="checkbox" id="dsr_autoscan" ${s.autoScan ? 'checked' : ''}>
          <span>${T('autoScan')}</span>
        </label>
        <label for="dsr_api_mode">${T('apiSection')}</label>
        <select id="dsr_api_mode" class="text_pole">
          <option value="main" ${s.apiMode === 'main' ? 'selected' : ''}>${T('apiMain')}</option>
          <option value="profile" ${s.apiMode === 'profile' ? 'selected' : ''}>${T('apiProfile')}</option>
        </select>
        <div id="dsr_profile_row" ${s.apiMode === 'profile' ? '' : 'style="display:none"'}>
          <label for="dsr_profile">${T('profile')}</label>
          <select id="dsr_profile" class="text_pole"></select>
        </div>
        <div class="dsr-st-actions">
          <input type="button" class="menu_button" id="dsr_open" value="${T('openCase')}">
          <input type="button" class="menu_button" id="dsr_scan" value="${T('scan')}">
        </div>
        <small class="dsr-st-hint">Остальные настройки — внутри самого дела, на вкладке «${T('settings')}».</small>
      </div>
    </div>`;
    host.appendChild(wrap);

    const fillProfiles = () => {
        const sel = wrap.querySelector('#dsr_profile');
        if (!sel) return;
        const profiles = listProfiles();
        sel.innerHTML = profiles.length
            ? profiles.map(p => `<option value="${p.id}"${p.id === getSettings().profileId ? ' selected' : ''}>${p.name}</option>`).join('')
            : `<option value="">${T('noProfiles')}</option>`;
    };
    fillProfiles();

    wrap.querySelector('#dsr_enabled').addEventListener('change', e => {
        const on = e.target.checked;
        getSettings().enabled = on;
        saveSettings();
        on ? refreshInjection() : clearInjection();
        refresh();
    });
    wrap.querySelector('#dsr_autoscan').addEventListener('change', e => {
        getSettings().autoScan = e.target.checked;
        saveSettings();
    });
    wrap.querySelector('#dsr_api_mode').addEventListener('change', e => {
        getSettings().apiMode = e.target.value;
        saveSettings();
        wrap.querySelector('#dsr_profile_row').style.display = e.target.value === 'profile' ? '' : 'none';
        fillProfiles();
        refresh();
    });
    wrap.querySelector('#dsr_profile').addEventListener('change', e => {
        getSettings().profileId = e.target.value;
        saveSettings();
        refresh();
    });
    wrap.querySelector('#dsr_open').addEventListener('click', () => openCase());
    wrap.querySelector('#dsr_scan').addEventListener('click', () => runScan());

    // профили могли появиться уже после загрузки
    const { eventSource, eventTypes } = ctx();
    for (const evt of [eventTypes.CONNECTION_PROFILE_CREATED, eventTypes.CONNECTION_PROFILE_DELETED, eventTypes.CONNECTION_PROFILE_UPDATED]) {
        if (evt) eventSource.on(evt, fillProfiles);
    }

    mark('panelMounted');
}

/* ------------------------------------------------------------------- запуск */

/** Шаги запуска изолированы: падение одного не уносит остальные. */
function step(name, fn) {
    try { fn(); return true; }
    catch (err) {
        console.error(`[Dossier] шаг «${name}» не выполнен:`, err);
        noteError(name, err);
        return false;
    }
}

function init() {
    const s = getSettings();
    initLocale(s.lang === 'auto' ? null : s.lang);

    if (step('интерфейс', mountUI)) {
        mark('domMounted');
        mark('listenersBound');
    }
    step('панель в меню расширений', () => mountSettingsPanel());
    step('подписка на события', bindStEvents);
    if (step('slash-команды', registerCommands)) mark('commandsRegistered');
    step('первичное состояние', () => {
        clampCursor();
        adoptExistingChat();
        recomputeClock();
        if (s.enabled) refreshInjection();
    });

    console.log(`[${MODULE}] дело заведено. Профили подключения: ${profilesAvailable() ? 'доступны' : 'недоступны'}`);
    console.log('[Dossier] если что-то не отзывается — выполните в консоли: dossierDoctor()');
}

jQuery(() => {
    try { init(); }
    catch (err) {
        console.error('[Dossier] не удалось запуститься:', err);
        noteError('запуск', err);
    }
});
