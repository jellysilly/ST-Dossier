/**
 * Перетаскивание указателем: одна ветка кода на мышь, палец и стилус.
 * Клик от перетаскивания отличаем по порогу сдвига.
 */

/**
 * Порог, после которого нажатие считается перетаскиванием.
 * У мыши дрожания нет, у пальца оно неизбежно: системный «tap slop» —
 * 8dp на Android и около 10px на iOS. С общим порогом в 5px обычное
 * касание папки почти всегда опознавалось как перетаскивание, и дело
 * не открывалось — на телефоне расширение выглядело неотзывчивым.
 */
const THRESHOLD = { mouse: 5, pen: 8, touch: 12 };

/** Неизвестный тип указателя — считаем пальцем: мягче к дрожанию. */
const slopFor = type => THRESHOLD[type] ?? THRESHOLD.touch;

/**
 * Элементы, с которых перетаскивание начинаться не должно.
 * Без этого setPointerCapture на ручке перенаправляет события себе,
 * и click до вложенной кнопки (например, крестика в шапке) не доходит вовсе.
 */
const INTERACTIVE = 'button, input, select, textarea, a, label, [data-act], [data-set], [data-toggle]';

/**
 * @param {HTMLElement} handle элемент-ручка
 * @param {HTMLElement} target что двигаем
 * @param {{onEnd?: (pos: {x: number, y: number}) => void, onClick?: () => void}} [opts]
 * @returns {() => void} отписка
 */
export function makeDraggable(handle, target, opts = {}) {
    let pointerId = null;
    let captured = false;
    let slop = THRESHOLD.touch;
    let startX = 0, startY = 0, baseX = 0, baseY = 0, moved = false;

    function onDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        if (e.isPrimary === false) return;
        if (typeof e.target?.closest === 'function' && e.target.closest(INTERACTIVE)) return;
        pointerId = e.pointerId;
        moved = false;
        slop = slopFor(e.pointerType);

        // Класс снимает «дыхание» папки: анимация сдвигает элемент
        // трансформацией, и замер до неё давал бы скачок в начале перетаскивания.
        target.classList.add('dsr-dragging');
        const rect = target.getBoundingClientRect();
        baseX = rect.left;
        baseY = rect.top;
        startX = e.clientX;
        startY = e.clientY;

        // Захват удерживает события за ручкой, но удаётся не всегда (чужой
        // захват, синтетическое событие, старый движок). Раньше исключение
        // отсюда обрывало и перетаскивание, и обычное нажатие — папка
        // «переставала реагировать».
        captured = capture(handle, pointerId);
        // Слушаем окно в любом случае: без захвата (и если он потерян
        // посреди жеста) события уходят тому, кто под пальцем, и палец,
        // сошедший с папки, обрывал бы перетаскивание.
        listen(window, true);
    }

    function onMove(e) {
        if (pointerId === null || e.pointerId !== pointerId) return;

        if (!moved) {
            if (Math.hypot(e.clientX - startX, e.clientY - startY) < slop) return;
            moved = true;
            // Перетаскивание отсчитываем от точки перехвата, а не от начала
            // касания: иначе элемент прыгал бы на величину порога.
            startX = e.clientX;
            startY = e.clientY;
        }
        e.preventDefault();

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const rect = target.getBoundingClientRect();
        const x = clamp(baseX + dx, 2, window.innerWidth - rect.width - 2);
        const y = clamp(baseY + dy, 2, window.innerHeight - rect.height - 2);
        target.style.left = x + 'px';
        target.style.top = y + 'px';
        target.style.right = 'auto';
        target.style.bottom = 'auto';
    }

    function onUp(e) {
        if (pointerId === null || e.pointerId !== pointerId) return;
        listen(window, false);
        if (captured) release(handle, pointerId);
        captured = false;
        pointerId = null;
        target.classList.remove('dsr-dragging');

        if (moved) {
            const rect = target.getBoundingClientRect();
            opts.onEnd?.({ x: Math.round(rect.left), y: Math.round(rect.top) });
        } else {
            opts.onClick?.();
        }
    }

    /** Подписка на продолжение жеста живёт только пока жест идёт. */
    function listen(node, on) {
        const fn = on ? 'addEventListener' : 'removeEventListener';
        node[fn]('pointermove', onMove);
        node[fn]('pointerup', onUp);
        node[fn]('pointercancel', onUp);
    }

    handle.addEventListener('pointerdown', onDown);

    return () => {
        handle.removeEventListener('pointerdown', onDown);
        listen(window, false);
    };
}

function capture(el, id) {
    if (typeof el.setPointerCapture !== 'function') return false;
    try { el.setPointerCapture(id); return el.hasPointerCapture?.(id) ?? true; }
    catch { return false; }
}

function release(el, id) {
    try { el.releasePointerCapture?.(id); } catch { /* указателя уже нет */ }
}

function clamp(v, min, max) {
    return Math.min(Math.max(v, min), Math.max(min, max));
}

/** Замер без анимации: «дышащая» папка иначе меряется вместе со сдвигом. */
function measure(target) {
    target.classList.add('dsr-measuring');
    const rect = target.getBoundingClientRect();
    target.classList.remove('dsr-measuring');
    return rect;
}

/** Возвращает элемент в видимую область — например, после поворота экрана. */
export function keepInViewport(target) {
    const rect = measure(target);
    if (!rect.width) return;
    const x = clamp(rect.left, 2, window.innerWidth - rect.width - 2);
    const y = clamp(rect.top, 2, window.innerHeight - rect.height - 2);
    // Пока элемент в кадре, не трогаем его вовсе: иначе привязка к правому
    // нижнему углу подменяется координатами и папка уползает при каждом
    // изменении размера окна.
    if (Math.abs(x - rect.left) < 1 && Math.abs(y - rect.top) < 1) return;
    target.style.left = x + 'px';
    target.style.top = y + 'px';
    target.style.right = 'auto';
    target.style.bottom = 'auto';
}
