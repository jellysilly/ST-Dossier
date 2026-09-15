/**
 * Перетаскивание указателем: одна ветка кода на мышь, палец и стилус.
 * Клик от перетаскивания отличаем по порогу сдвига.
 */

const THRESHOLD = 5;

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
    let startX = 0, startY = 0, baseX = 0, baseY = 0, moved = false;

    function onDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        if (typeof e.target?.closest === 'function' && e.target.closest(INTERACTIVE)) return;
        pointerId = e.pointerId;
        moved = false;
        const rect = target.getBoundingClientRect();
        baseX = rect.left;
        baseY = rect.top;
        startX = e.clientX;
        startY = e.clientY;
        handle.setPointerCapture?.(pointerId);
        target.classList.add('dsr-dragging');
    }

    function onMove(e) {
        if (pointerId === null || e.pointerId !== pointerId) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < THRESHOLD) return;
        moved = true;
        e.preventDefault();

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
        handle.releasePointerCapture?.(pointerId);
        pointerId = null;
        target.classList.remove('dsr-dragging');

        if (moved) {
            const rect = target.getBoundingClientRect();
            opts.onEnd?.({ x: Math.round(rect.left), y: Math.round(rect.top) });
        } else {
            opts.onClick?.();
        }
    }

    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);

    return () => {
        handle.removeEventListener('pointerdown', onDown);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
    };
}

function clamp(v, min, max) {
    return Math.min(Math.max(v, min), Math.max(min, max));
}

/** Возвращает элемент в видимую область — например, после поворота экрана. */
export function keepInViewport(target) {
    const rect = target.getBoundingClientRect();
    if (!rect.width) return;
    const x = clamp(rect.left, 2, window.innerWidth - rect.width - 2);
    const y = clamp(rect.top, 2, window.innerHeight - rect.height - 2);
    target.style.left = x + 'px';
    target.style.top = y + 'px';
}
