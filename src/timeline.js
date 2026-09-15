/**
 * Внутриигровые часы.
 *
 * Мир может быть с обычным календарём («3 марта, 8 утра») или без него
 * («на третий день пути»). Поэтому считаем две вещи сразу: накопленные минуты
 * от начала истории и последнюю формулировку времени прямо из текста.
 */

import { T } from './i18n.js';

/** «3 д 4 ч 20 мин» */
export function formatElapsed(totalMinutes) {
    const m = Math.max(0, Math.round(Number(totalMinutes) || 0));
    if (m === 0) return '0 ' + T('min');
    const days = Math.floor(m / 1440);
    const hours = Math.floor((m % 1440) / 60);
    const mins = m % 60;
    const parts = [];
    if (days) parts.push(days + ' ' + T('day'));
    if (hours) parts.push(hours + ' ' + T('hour'));
    if (mins && !days) parts.push(mins + ' ' + T('min'));
    return parts.join(' ') || ('0 ' + T('min'));
}

/** Пытаемся понять начальную дату. Не вышло — мир живёт без календаря. */
export function parseStartDate(input) {
    if (!input) return null;
    const raw = String(input).trim();
    if (!raw) return null;
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T00:00:00' : raw;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Начальная дата + накопленные минуты. null — если календаря нет. */
export function currentWorldDate(clock, startDateSetting) {
    const start = parseStartDate(clock?.startDate || startDateSetting);
    if (!start) return null;
    return new Date(start.getTime() + (Number(clock?.elapsedMinutes) || 0) * 60000);
}

export function formatWorldDate(date) {
    if (!date) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Короткая сводка о времени — идёт в промпт разбора и в подмешивание. */
export function clockSummary(clock, startDateSetting) {
    const bits = [];
    const world = currentWorldDate(clock, startDateSetting);
    if (world) bits.push(`${T('now')}: ${formatWorldDate(world)}`);
    if (clock?.statedTime) bits.push(`${T('now')} (по тексту): ${clock.statedTime}`);
    bits.push(`${T('elapsed')}: ${formatElapsed(clock?.elapsedMinutes)}`);
    if (clock?.location) bits.push(`${T('place')}: ${clock.location}`);
    return bits.join(' · ');
}

/** Приводим ответ модели к безопасному числу минут. */
export function sanitizeAdvance(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    // отсекаем галлюцинации вроде «прошло 900 лет» за один обмен репликами
    return Math.min(Math.round(n), 60 * 24 * 365);
}
