/** Папка на экране: перетаскивание, раскрытие, перелистывание страниц. */

import { T } from './i18n.js';
import { getSettings, saveSettings } from './settings.js';
import { getCase, resetCase, exportCase, importCase, saveCase } from './store.js';
import { makeDraggable, keepInViewport } from './drag.js';
import { BUTTERFLY, SVG_DEFS, KEY_ICON, LENS_ICON, FOLDER_ICON, TORN_EDGE } from './assets.js';
import { renderArchive, renderTimeline, renderCast, renderSettings, esc } from './views.js';
import {
    bus, scanAll, backfill, isBusy, pendingCount, skippedCount,
    updateFact, deleteFact, deleteScene, addManualFact, recomputeClock, notifyUpdated,
} from './extractor.js';
import { refreshInjection } from './inject.js';

const state = { open: false, page: 'archive', query: '', filter: 'all', mounted: false };

let root, folderEl, caseEl, pagesEl, badgeEl, scanBtn;

const ctx = () => SillyTavern.getContext();
const isNarrow = () => window.innerWidth <= 680;

function toast(msg, type = 'info') {
    try { globalThis.toastr?.[type]?.(msg, 'Dossier'); }
    catch { console.log('[Dossier]', msg); }
}

/* ---------------------------------------------------------------- сборка */

export function mountUI() {
    if (state.mounted) return;

    root = document.createElement('div');
    root.id = 'dsr-root';
    root.innerHTML = SVG_DEFS + folderMarkup() + caseMarkup();
    document.body.appendChild(root);

    folderEl = root.querySelector('#dsr-folder');
    caseEl = root.querySelector('#dsr-case');
    pagesEl = root.querySelector('#dsr-pages');
    badgeEl = root.querySelector('#dsr-badge');
    scanBtn = root.querySelector('[data-act="scan"]');

    restorePosition();
    bindEvents();
    state.mounted = true;
    refresh();
}

function folderMarkup() {
    return `
    <div id="dsr-folder" class="dsr-folder" role="button" tabindex="0" aria-label="${esc(T('openCase'))}" title="${esc(T('openCase'))}">
      <span class="dsr-folder__tab">${esc(T('title'))}</span>
      <span class="dsr-folder__paper"></span>
      <span class="dsr-folder__face">${FOLDER_ICON}</span>
      <span id="dsr-badge" class="dsr-folder__badge" hidden>0</span>
      <span class="dsr-folder__grip" aria-hidden="true"></span>
    </div>`;
}

function caseMarkup() {
    return `
    <section id="dsr-case" class="dsr-case" hidden aria-modal="false">
      <div class="dsr-case__cover" aria-hidden="true"></div>
      <div class="dsr-case__sheet">
        <span class="dsr-strip dsr-strip--l" aria-hidden="true"></span>
        <span class="dsr-strip dsr-strip--r" aria-hidden="true"></span>
        <header id="dsr-head" class="dsr-case__head">
          <div class="dsr-case__ident">
            <span class="dsr-case__script">The Key to Rebecca</span>
            <span class="dsr-case__no">№ 007</span>
          </div>
          <div class="dsr-case__tools">
            ${KEY_ICON}
            <button class="dsr-close" data-act="close" aria-label="${esc(T('close'))}">✕</button>
          </div>
        </header>

        <nav class="dsr-tabs" role="tablist">
          ${['archive', 'timeline', 'cast', 'settings'].map(p => `
            <button class="dsr-tab" role="tab" data-page="${p}" aria-selected="false">
              <span>${esc(T(p))}</span>
            </button>`).join('')}
        </nav>

        <div class="dsr-paper">
          ${BUTTERFLY}
          <div id="dsr-pages" class="dsr-pages"></div>
          ${TORN_EDGE}
        </div>

        <footer class="dsr-case__foot">
          <button class="dsr-btn dsr-btn--primary" data-act="scan">${LENS_ICON}<span>${esc(T('scan'))}</span></button>
          <button class="dsr-btn dsr-btn--ghost" data-act="add">${esc(T('addFact'))}</button>
          <span class="dsr-burn">${esc(T('burn'))}</span>
        </footer>
      </div>
    </section>`;
}

/* ------------------------------------------------------------- положение */

function restorePosition() {
    const s = getSettings();
    if (s.posX !== null && s.posY !== null) {
        folderEl.style.left = s.posX + 'px';
        folderEl.style.top = s.posY + 'px';
        folderEl.style.right = 'auto';
        folderEl.style.bottom = 'auto';
    }
    requestAnimationFrame(() => keepInViewport(folderEl));
}

export function resetPosition() {
    const s = getSettings();
    s.posX = null; s.posY = null;
    saveSettings();
    folderEl.style.left = '';
    folderEl.style.top = '';
    folderEl.style.right = '';
    folderEl.style.bottom = '';
    toast(T('saved'), 'success');
}

/* ---------------------------------------------------------------- события */

function bindEvents() {
    makeDraggable(folderEl, folderEl, {
        onEnd: pos => { const s = getSettings(); s.posX = pos.x; s.posY = pos.y; saveSettings(); },
        onClick: () => toggleCase(),
    });

    folderEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCase(); }
    });

    // на узком экране дело раскрывается на весь экран, таскать нечего
    const head = root.querySelector('#dsr-head');
    makeDraggable(head, caseEl, {
        onEnd: () => { if (isNarrow()) { caseEl.style.left = ''; caseEl.style.top = ''; } },
    });

    root.querySelectorAll('.dsr-tab').forEach(btn => {
        btn.addEventListener('click', () => switchPage(btn.dataset.page));
    });

    root.addEventListener('click', onAction);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);

    window.addEventListener('resize', () => keepInViewport(folderEl));
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && state.open) closeCase();
    });

    bus.addEventListener('updated', () => { refresh(); refreshInjection(); });
    bus.addEventListener('busy', e => setBusy(e.detail.busy));
}

/** Ищем элемент управления в пределах нашего дерева. */
function owned(target, selector) {
    if (typeof target?.closest !== 'function') return null;
    const el = target.closest(selector);
    return el && root.contains(el) ? el : null;
}

async function onAction(e) {
    // Переключатель источника и тумблеры помечены своими атрибутами, а не
    // data-act, поэтому проверяем их до выхода по отсутствию data-act.
    const modeBtn = owned(e.target, '[data-set-mode]');
    if (modeBtn) {
        getSettings().apiMode = modeBtn.dataset.setMode;
        saveSettings();
        refresh();
        return;
    }

    const toggleBtn = owned(e.target, '[data-toggle]');
    if (toggleBtn) {
        const key = toggleBtn.dataset.toggle;
        const s = getSettings();
        s[key] = !s[key];
        saveSettings();
        if (key === 'inject' || key === 'trackTime') refreshInjection();
        refresh();
        return;
    }

    const btn = owned(e.target, '[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;

    switch (act) {
        case 'close': closeCase(); break;
        case 'scan': await runScan(); break;
        case 'add': await promptAddFact(); break;
        case 'backfill': await runBackfill(); break;
        case 'filter': state.filter = btn.dataset.value; refresh(); break;
        case 'pin': {
            const f = getCase().facts.find(x => x.id === id);
            if (f) updateFact(id, { pinned: !f.pinned });
            break;
        }
        case 'edit': await promptEditFact(id); break;
        case 'del': deleteFact(id); break;
        case 'del-scene': deleteScene(id); break;
        case 'set-start': await promptStartDate(); break;
        case 'export': doExport(); break;
        case 'import': doImport(); break;
        case 'wipe': await doWipe(); break;
        case 'reset-pos': resetPosition(); break;
    }
}

function onChange(e) {
    const el = owned(e.target, '[data-set]');
    if (!el) return;
    const key = el.dataset.set;
    const s = getSettings();
    s[key] = el.type === 'number' ? Number(el.value) : el.value;
    saveSettings();
    if (key === 'startDate') {
        getCase().clock.startDate = s.startDate;
        saveCase();
        if (state.page === 'timeline') refresh();
    }
    if (key === 'injectDepth' || key === 'injectMaxFacts') refreshInjection();
}

function onInput(e) {
    const el = owned(e.target, '[data-role="search"]');
    if (!el) return;
    state.query = el.value;
    const list = pagesEl.querySelector('.dsr-cards, .dsr-empty');
    const fresh = document.createElement('div');
    fresh.innerHTML = renderArchive(state);
    const replacement = fresh.querySelector('.dsr-cards, .dsr-empty');
    if (list && replacement) list.replaceWith(replacement);
}

/* ------------------------------------------------------- открыть/закрыть */

export function toggleCase() {
    state.open ? closeCase() : openCase();
}

export function openCase() {
    if (state.open) return;
    state.open = true;
    caseEl.hidden = false;
    caseEl.classList.toggle('dsr-case--sheet', isNarrow());
    folderEl.classList.add('is-open');
    // старт анимации после того, как элемент попал в поток
    requestAnimationFrame(() => caseEl.classList.add('is-open'));
    positionCase();
    refresh();
}

export function closeCase() {
    if (!state.open) return;
    state.open = false;
    folderEl.classList.remove('is-open');
    caseEl.classList.remove('is-open');
    const done = () => { if (!state.open) caseEl.hidden = true; };
    getSettings().animations ? setTimeout(done, 280) : done();
}

/** Раскрываем дело рядом с папкой, но не за краем экрана. */
function positionCase() {
    if (isNarrow()) { caseEl.style.left = ''; caseEl.style.top = ''; return; }
    const f = folderEl.getBoundingClientRect();
    const w = Math.min(560, window.innerWidth - 24);
    const h = Math.min(640, window.innerHeight - 24);
    let x = f.right + 12;
    if (x + w > window.innerWidth - 12) x = Math.max(12, f.left - w - 12);
    let y = Math.min(f.top, window.innerHeight - h - 12);
    caseEl.style.left = Math.max(12, x) + 'px';
    caseEl.style.top = Math.max(12, y) + 'px';
}

/* ------------------------------------------------------- перелистывание */

function switchPage(page) {
    if (page === state.page) return;
    const s = getSettings();
    state.page = page;
    s.openPage = page;
    saveSettings();
    markTabs();

    if (!s.animations) { paint(); return; }

    pagesEl.classList.remove('dsr-flip-in');
    pagesEl.classList.add('dsr-flip-out');
    setTimeout(() => {
        paint();
        pagesEl.classList.remove('dsr-flip-out');
        pagesEl.classList.add('dsr-flip-in');
    }, 170);
}

function markTabs() {
    root.querySelectorAll('.dsr-tab').forEach(b => {
        const on = b.dataset.page === state.page;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', String(on));
    });
}

function paint() {
    switch (state.page) {
        case 'timeline': pagesEl.innerHTML = renderTimeline(); break;
        case 'cast': pagesEl.innerHTML = renderCast(); break;
        case 'settings': pagesEl.innerHTML = renderSettings(); break;
        default: pagesEl.innerHTML = renderArchive(state);
    }
}

/* ------------------------------------------------------------- обновление */

export function refresh() {
    if (!state.mounted) return;
    updateBadge();
    if (!state.open) return;
    markTabs();
    paint();
}

function updateBadge() {
    // На значке всегда вес дела — число материалов. О неразобранном
    // говорит цвет, иначе одна и та же цифра означала бы то одно, то другое.
    const pending = pendingCount() + skippedCount();
    const total = getCase().facts.length;
    badgeEl.hidden = !total && !pending;
    badgeEl.textContent = total > 99 ? '99+' : String(total);
    badgeEl.classList.toggle('is-pending', pending > 0);
    folderEl.classList.toggle('has-pending', pending > 0);
}

function setBusy(busy) {
    root?.classList.toggle('is-busy', busy);
    if (!scanBtn) return;
    scanBtn.disabled = busy;
    const label = scanBtn.querySelector('span');
    if (label) label.textContent = busy ? T('scanning') : T('scan');
}

/* ---------------------------------------------------------------- команды */

export async function runScan() {
    if (isBusy()) return toast(T('busy'), 'info');
    if (!ctx().chat?.length) return toast(T('noChat'), 'warning');
    try {
        const added = await scanAll();
        toast(added.length ? `${T('scanDone')} ${added.length}` : T('scanNone'),
            added.length ? 'success' : 'info');
    } catch (err) {
        console.error('[Dossier]', err);
        toast(`${T('scanFail')}: ${err.message}`, 'error');
    }
}

async function runBackfill() {
    if (isBusy()) return toast(T('busy'), 'info');
    try {
        const added = await backfill((done, total) => setBusyLabel(`${done}/${total}`));
        toast(`${T('scanDone')} ${added.length}`, 'success');
    } catch (err) {
        console.error('[Dossier]', err);
        toast(`${T('scanFail')}: ${err.message}`, 'error');
    } finally {
        setBusy(false);
    }
}

function setBusyLabel(text) {
    const label = scanBtn?.querySelector('span');
    if (label) label.textContent = `${T('scanning')} ${text}`;
}

/* ------------------------------------------------------------------ диалоги */

async function promptAddFact() {
    const c = ctx();
    const text = await c.callGenericPopup(T('manualFact'), c.POPUP_TYPE.INPUT, '', { rows: 3 });
    if (text && String(text).trim()) addManualFact(String(text).trim());
}

async function promptEditFact(id) {
    const fact = getCase().facts.find(x => x.id === id);
    if (!fact) return;
    const c = ctx();
    const text = await c.callGenericPopup(T('manualFact'), c.POPUP_TYPE.INPUT, fact.text, { rows: 3 });
    if (text !== null && text !== undefined && String(text).trim()) {
        updateFact(id, { text: String(text).trim() });
    }
}

async function promptStartDate() {
    const c = ctx();
    const s = getSettings();
    const value = await c.callGenericPopup(T('newDate'), c.POPUP_TYPE.INPUT, s.startDate || '');
    if (value === null || value === undefined) return;
    s.startDate = String(value).trim();
    saveSettings();
    getCase().clock.startDate = s.startDate;
    recomputeClock();
    saveCase();
    refreshInjection();
    refresh();
}

async function doWipe() {
    const c = ctx();
    const ok = await c.callGenericPopup(T('wipeConfirm'), c.POPUP_TYPE.CONFIRM);
    if (ok !== c.POPUP_RESULT.AFFIRMATIVE) return;
    resetCase();
    refreshInjection();
    notifyUpdated();
    refresh();
    toast(T('saved'), 'success');
}

function doExport() {
    const blob = new Blob([exportCase()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = (ctx().getCurrentChatId?.() || 'case').toString().replace(/[^\w.-]+/g, '_');
    a.href = url;
    a.download = `dossier-${name}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function doImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            importCase(await file.text());
            recomputeClock();
            saveCase();
            refreshInjection();
            refresh();
            toast(T('saved'), 'success');
        } catch (err) {
            toast(err.message, 'error');
        }
    });
    input.click();
}

/** Пересчёт значка при смене чата. */
export function onChatChanged() {
    state.query = '';
    state.filter = 'all';
    refresh();
}
