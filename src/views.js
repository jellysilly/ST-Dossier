/** Отрисовка страниц дела. Разметка простая, всё поведение — делегированием из ui.js. */

import { T } from './i18n.js';
import { getSettings } from './settings.js';
import { getCase } from './store.js';
import { formatElapsed, currentWorldDate, formatWorldDate } from './timeline.js';
import { pendingCount, skippedCount } from './extractor.js';
import { listProfiles, profilesAvailable } from './llm.js';
import { STAMP } from './assets.js';

export function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
}

const KIND_LABEL = {
    event: 'kindEvent', fact: 'kindFact', relation: 'kindRelation',
    place: 'kindPlace', item: 'kindItem', promise: 'kindPromise', secret: 'kindSecret',
};

function dots(importance) {
    const n = Math.min(5, Math.max(1, importance || 1));
    return '●'.repeat(n) + '○'.repeat(5 - n);
}

function stampNo(index) {
    return String(index + 1).padStart(3, '0');
}

/* ------------------------------------------------------------------ АРХИВ */

export function renderArchive(state) {
    const c = getCase();
    const q = (state.query || '').trim().toLowerCase();
    const filter = state.filter || 'all';

    let facts = [...c.facts].reverse();
    if (filter === 'pinned') facts = facts.filter(f => f.pinned);
    else if (filter !== 'all') facts = facts.filter(f => f.kind === filter);
    if (q) facts = facts.filter(f => f.text.toLowerCase().includes(q)
        || (f.actors || []).join(' ').toLowerCase().includes(q));

    const pending = pendingCount();
    const skipped = skippedCount();

    const head = `
    <div class="dsr-toolbar">
      <div class="dsr-search">
        <input type="search" class="dsr-input" data-role="search" placeholder="${esc(T('search'))}…" value="${esc(state.query || '')}">
      </div>
      <div class="dsr-chips">
        ${['all', 'pinned', 'event', 'relation', 'secret', 'promise'].map(k => `
          <button class="dsr-chip${filter === k ? ' is-on' : ''}" data-act="filter" data-value="${k}">
            ${esc(k === 'all' ? T('filterAll') : k === 'pinned' ? T('filterPinned') : T(KIND_LABEL[k]))}
          </button>`).join('')}
      </div>
      <div class="dsr-counts">
        <span>${c.facts.length} ${esc(T('factsTotal'))}</span>
        ${pending ? `<span class="dsr-warn">${pending} ${esc(T('unprocessed'))}</span>` : ''}
      </div>
    </div>
    ${skipped ? `
    <div class="dsr-note">
      <span>${skipped} ${esc(T('unprocessed'))} (${esc(T('caseFile'))})</span>
      <button class="dsr-btn dsr-btn--ghost" data-act="backfill">${esc(T('scan'))}</button>
    </div>` : ''}`;

    if (!facts.length) {
        return head + `<div class="dsr-empty">${STAMP}<p>${esc(T('empty'))}</p></div>`;
    }

    const cards = facts.map((f, i) => `
    <article class="dsr-card${f.pinned ? ' is-pinned' : ''}" data-id="${esc(f.id)}" style="--i:${i}">
      <div class="dsr-card__tab">
        <span class="dsr-card__no">${stampNo(c.facts.indexOf(f))}</span>
        <span class="dsr-card__kind">${esc(T(KIND_LABEL[f.kind] || 'kindFact'))}</span>
      </div>
      <div class="dsr-card__paper">
        <p class="dsr-card__text">${esc(f.text)}</p>
        <div class="dsr-card__meta">
          <span class="dsr-imp" title="${esc(T('importance'))}">${dots(f.importance)}</span>
          ${(f.actors || []).length ? `<span class="dsr-actors">${esc(f.actors.join(' · '))}</span>` : ''}
          ${f.msgStart !== null && f.msgStart !== undefined ? `<span class="dsr-msg">#${f.msgStart}–${f.msgEnd}</span>` : ''}
        </div>
      </div>
      <div class="dsr-card__acts">
        <button class="dsr-mini" data-act="pin" data-id="${esc(f.id)}" title="${esc(f.pinned ? T('unpin') : T('pin'))}">${f.pinned ? '★' : '☆'}</button>
        <button class="dsr-mini" data-act="edit" data-id="${esc(f.id)}" title="${esc(T('edit'))}">✎</button>
        <button class="dsr-mini dsr-mini--danger" data-act="del" data-id="${esc(f.id)}" title="${esc(T('del'))}">✕</button>
      </div>
    </article>`).join('');

    return head + `<div class="dsr-cards">${cards}</div>`;
}

/* ------------------------------------------------------------- ХРОНОЛОГИЯ */

export function renderTimeline() {
    const c = getCase();
    const s = getSettings();
    const world = currentWorldDate(c.clock, s.startDate);

    const clock = `
    <div class="dsr-clock">
      <div class="dsr-clock__face">
        <div class="dsr-clock__big">${esc(world ? formatWorldDate(world) : (c.clock.statedTime || T('noData')))}</div>
        <div class="dsr-clock__sub">${esc(T('elapsed'))}: ${esc(formatElapsed(c.clock.elapsedMinutes))}</div>
        ${c.clock.location ? `<div class="dsr-clock__place">${esc(T('place'))}: ${esc(c.clock.location)}</div>` : ''}
      </div>
      <button class="dsr-btn dsr-btn--ghost" data-act="set-start">${esc(T('setStart'))}</button>
    </div>`;

    const scenes = [...c.scenes].sort((a, b) => (b.msgStart ?? 0) - (a.msgStart ?? 0));
    if (!scenes.length) return clock + `<div class="dsr-empty"><p>${esc(T('emptyTime'))}</p></div>`;

    const items = scenes.map((sc, i) => `
    <article class="dsr-tl" data-id="${esc(sc.id)}" style="--i:${i}">
      <div class="dsr-tl__rail"><span class="dsr-tl__dot"></span></div>
      <div class="dsr-tl__when">
        ${sc.statedTime ? `<b>${esc(sc.statedTime)}</b>` : ''}
        ${sc.advanceMinutes ? `<span class="dsr-tl__delta">+${esc(formatElapsed(sc.advanceMinutes))}</span>` : ''}
        <span class="dsr-msg">#${sc.msgStart}–${sc.msgEnd}</span>
      </div>
      <div class="dsr-tl__body">
        <h4>${esc(sc.title)}</h4>
        ${sc.location ? `<div class="dsr-tl__place">${esc(sc.location)}</div>` : ''}
        ${sc.summary ? `<p>${esc(sc.summary)}</p>` : ''}
      </div>
      <button class="dsr-mini dsr-mini--danger" data-act="del-scene" data-id="${esc(sc.id)}" title="${esc(T('del'))}">✕</button>
    </article>`).join('');

    return clock + `<div class="dsr-tl-list">${items}</div>`;
}

/* ------------------------------------------------------------------ ЛИЦА */

export function renderCast() {
    const c = getCase();
    const people = [...c.entities].sort((a, b) => (b.mentions || 0) - (a.mentions || 0));
    if (!people.length) return `<div class="dsr-empty"><p>${esc(T('emptyCast'))}</p></div>`;

    return `<div class="dsr-cast">` + people.map((p, i) => `
    <article class="dsr-person" style="--i:${i}">
      <div class="dsr-person__photo">
        <svg viewBox="0 0 60 70" aria-hidden="true"><circle cx="30" cy="24" r="14"/><path d="M6,70 C6,46 54,46 54,70 Z"/></svg>
        <span class="dsr-person__no">№ ${stampNo(i)}</span>
      </div>
      <div class="dsr-person__data">
        <div class="dsr-line"><span>${esc(T('nameLabel'))}</span><b>${esc(p.name)}</b></div>
        <div class="dsr-line"><span>${esc(T('mentions'))}</span><b>${esc(String(p.mentions || 1))}</b></div>
        ${(p.notes || []).map(n => `<div class="dsr-person__note">${esc(n)}</div>`).join('')}
      </div>
    </article>`).join('') + `</div>`;
}

/* ------------------------------------------------------------- НАСТРОЙКИ */

function field(label, control, hint) {
    return `<div class="dsr-field">
      <label class="dsr-field__label">${esc(label)}</label>
      <div class="dsr-field__ctl">${control}</div>
      ${hint ? `<div class="dsr-field__hint">${esc(hint)}</div>` : ''}
    </div>`;
}

function num(key, value, min, max, step = 1) {
    return `<input type="number" class="dsr-input dsr-input--num" data-set="${key}" value="${esc(String(value))}" min="${min}" max="${max}" step="${step}">`;
}

function toggle(key, value) {
    return `<button class="dsr-toggle${value ? ' is-on' : ''}" data-toggle="${key}" role="switch" aria-checked="${!!value}"><span></span></button>`;
}

export function renderSettings() {
    const s = getSettings();
    const profiles = listProfiles();
    const hasCM = profilesAvailable();

    const profileOptions = profiles.length
        ? profiles.map(p => `<option value="${esc(p.id)}"${p.id === s.profileId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')
        : `<option value="">${esc(T('noProfiles'))}</option>`;

    return `
    <div class="dsr-setup">
      <section class="dsr-group">
        <h5 class="dsr-group__title">${esc(T('apiSection'))}</h5>
        <div class="dsr-radio">
          <button class="dsr-radio__opt${s.apiMode === 'main' ? ' is-on' : ''}" data-set-mode="main">${esc(T('apiMain'))}</button>
          <button class="dsr-radio__opt${s.apiMode === 'profile' ? ' is-on' : ''}" data-set-mode="profile"${hasCM ? '' : ' disabled'}>${esc(T('apiProfile'))}</button>
        </div>
        ${s.apiMode === 'profile' ? field(T('profile'),
        `<select class="dsr-input" data-set="profileId">${profileOptions}</select>`,
        hasCM ? '' : T('noProfiles')) : ''}
        ${s.apiMode === 'profile' ? field(T('usePreset'), toggle('usePreset', s.usePreset)) : ''}
        ${field(T('maxTokens'), num('maxTokens', s.maxTokens, 128, 4096, 32))}
      </section>

      <section class="dsr-group">
        <h5 class="dsr-group__title">${esc(T('parsing'))}</h5>
        ${field(T('autoScan'), toggle('autoScan', s.autoScan))}
        ${field(T('everyN'), num('everyN', s.everyN, 1, 50))}
        ${field(T('maxMsg'), num('maxMessages', s.maxMessages, 2, 100))}
        ${field(T('maxChars'), num('maxChars', s.maxChars, 200, 8000, 100))}
        ${field(T('minImp'), num('minImportance', s.minImportance, 1, 5))}
      </section>

      <section class="dsr-group">
        <h5 class="dsr-group__title">${esc(T('timeline'))}</h5>
        ${field(T('trackTime'), toggle('trackTime', s.trackTime))}
        ${field(T('startDate'), `<input type="text" class="dsr-input" data-set="startDate" value="${esc(s.startDate)}" placeholder="2024-03-01 08:00">`)}
      </section>

      <section class="dsr-group">
        <h5 class="dsr-group__title">${esc(T('inject'))}</h5>
        ${field(T('inject'), toggle('inject', s.inject))}
        ${field(T('injectDepth'), num('injectDepth', s.injectDepth, 0, 100))}
        ${field(T('injectMax'), num('injectMaxFacts', s.injectMaxFacts, 1, 100))}
      </section>

      <section class="dsr-group">
        <h5 class="dsr-group__title">${esc(T('settings'))}</h5>
        ${field(T('anim'), toggle('animations', s.animations))}
        <div class="dsr-actions">
          <button class="dsr-btn dsr-btn--ghost" data-act="export">${esc(T('exportBtn'))}</button>
          <button class="dsr-btn dsr-btn--ghost" data-act="import">${esc(T('importBtn'))}</button>
          <button class="dsr-btn dsr-btn--ghost" data-act="reset-pos">${esc(T('reset'))}</button>
          <button class="dsr-btn dsr-btn--danger" data-act="wipe">${esc(T('wipe'))}</button>
        </div>
      </section>
    </div>`;
}
