/**
 * Самодиагностика. Нужна потому, что «папка не реагирует» имеет с десяток
 * причин снаружи расширения: чужой слой поверх, два установленных экземпляра,
 * оборвавшийся запуск. Отчёт можно скопировать целиком.
 */

const flags = {
    domMounted: false,
    listenersBound: false,
    panelMounted: false,
    commandsRegistered: false,
    initError: null,
    stepErrors: [],
};

export function mark(flag, value = true) { flags[flag] = value; }
export function noteError(step, err) {
    flags.stepErrors.push(`${step}: ${err?.message || err}`);
}

function ctx() {
    try { return SillyTavern.getContext(); } catch { return null; }
}

/* Диагностика обязана дожить до конца в любом окружении: если она падает
   сама, от неё нет толку ровно тогда, когда она нужна. */
function style(el) {
    try { return getComputedStyle(el); } catch { return null; }
}
function rect(el) {
    try { return el.getBoundingClientRect(); } catch { return null; }
}
function pick(el, prop, fallback = '?') {
    const cs = style(el);
    return cs ? cs[prop] : fallback;
}

export function diagnose() {
    const L = [];
    const say = (k, v) => L.push(`${k.padEnd(26)} ${v}`);

    L.push('=== Dossier: самодиагностика ===');
    try {
        collect(say);
    } catch (err) {
        L.push('диагностика оборвалась: ' + (err?.message || err));
    }

    const report = L.join('\n');
    console.log(report);
    return report;
}

function collect(say) {

    const roots = document.querySelectorAll('#dsr-root');
    say('экземпляров на странице', roots.length + (roots.length > 1 ? '  <-- УСТАНОВЛЕН ДВАЖДЫ' : ''));

    const root = document.getElementById('dsr-root');
    say('корень в DOM', root ? 'да' : 'НЕТ');
    say('обработчики привязаны', flags.listenersBound ? 'да' : 'НЕТ');
    say('панель в меню', flags.panelMounted ? 'да' : 'НЕТ');
    say('slash-команды', flags.commandsRegistered ? 'да' : 'НЕТ');
    say('Pointer Events', 'PointerEvent' in window ? 'есть' : 'НЕТ (старый браузер)');

    if (flags.initError) say('ошибка запуска', flags.initError);
    // say, а не L: L сюда не передан, и обращение к нему роняло диагностику
    // ровно в том случае, когда ей было о чём рассказать.
    flags.stepErrors.forEach((e, i) => say(i ? '' : 'шаги с ошибками', e));

    if (root) {
        say('z-index корня', pick(root, 'zIndex'));
        say('pointer-events корня', pick(root, 'pointerEvents'));

        // Слой обязан совпадать с экраном. Если чужой предок (в SillyTavern это
        // <html> с -webkit-perspective) стал содержащим блоком и схлопнулся в
        // нулевую высоту, всё, что мы кладём «снизу», уезжает за верхнюю кромку.
        const rr = rect(root);
        if (rr) {
            say('слой расширения', `${Math.round(rr.left)},${Math.round(rr.top)} ${Math.round(rr.width)}x${Math.round(rr.height)}`);
            say('экран', `${innerWidth}x${innerHeight}`);
            const ok = Math.abs(rr.top) < 2 && Math.abs(rr.left) < 2 && rr.height > innerHeight / 2;
            say('слой совпал с экраном', ok ? 'да' : 'НЕТ <-- отсчёт снизу уедет за кромку');
            if (!ok) say('содержащий блок', describe(offsetRoot(root)));
        }
    }

    const folder = document.getElementById('dsr-folder');
    say('папка в DOM', folder ? 'да' : 'НЕТ');

    const r = folder && rect(folder);
    if (folder && r) {
        const fs = style(folder);
        say('положение папки', `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        if (fs) say('видима', (fs.display !== 'none' && fs.visibility !== 'hidden' && Number(fs.opacity) > 0) ? 'да' : 'НЕТ');
        say('в пределах экрана',
            (r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight) ? 'да' : 'НЕТ <-- уехала за край');
        say('pointer-events папки', pick(folder, 'pointerEvents'));
        say('touch-action папки', pick(folder, 'touchAction'));

        // Кто на самом деле окажется под пальцем
        const cx = Math.round(r.left + r.width / 2);
        const cy = Math.round(r.top + r.height / 2);
        const top = document.elementFromPoint?.(cx, cy);
        // Вердикт выносим только если под точкой действительно что-то нашлось:
        // ложная тревога хуже её отсутствия.
        if (top) {
            // Различаем три случая: палец попадает в папку; его перехватил
            // наш же слой (например, не скрывшееся дело); сверху чужой слой.
            const ours = top === folder || folder.contains(top);
            const inside = !!(root && root.contains(top));
            say('под курсором/пальцем', describe(top));
            say('это наша папка', ours ? 'да'
                : inside ? 'НЕТ <-- ПЕРЕКРЫТА СВОИМ ЖЕ СЛОЕМ'
                    : 'НЕТ <-- ПЕРЕКРЫТА ЧУЖИМ СЛОЕМ');
            if (!ours) say('z-index перекрывшего', topZ(top));
        } else {
            say('под курсором/пальцем', 'определить не удалось');
        }
    }

    const caseEl = document.getElementById('dsr-case');
    if (caseEl) {
        const cs = style(caseEl);
        const stuck = caseEl.hidden && cs && cs.display !== 'none';
        say('дело', caseEl.hidden ? 'закрыто' : 'открыто');
        if (stuck) say('закрытое дело в потоке', 'ДА <-- слой глотает касания интерфейса');
    }

    const c = ctx();
    say('контекст SillyTavern', c ? 'доступен' : 'НЕТ');
    if (c) {
        say('настройки расширения', c.extensionSettings?.dossier ? 'есть' : 'НЕТ');
        say('сообщений в чате', Array.isArray(c.chat) ? c.chat.length : 'нет чата');
    }
    say('узел #extensions_settings2', document.getElementById('extensions_settings2') ? 'есть' : 'НЕТ');
}

/** Предок, от которого браузер отсчитывает наш слой. */
function offsetRoot(el) {
    let node = el.parentElement;
    while (node) {
        const cs = style(node);
        if (cs && (cs.transform !== 'none' || cs.perspective !== 'none' ||
                   cs.filter !== 'none' || cs.willChange !== 'auto' || cs.contain !== 'none')) return node;
        node = node.parentElement;
    }
    return document.documentElement;
}

function describe(el) {
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className
        ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
        : '';
    return (el.tagName.toLowerCase() + id + cls).slice(0, 70);
}

/** Наибольший z-index среди предков — именно он перекрывает. */
function topZ(el) {
    let node = el, best = 'auto';
    while (node && node !== document.documentElement) {
        const z = pick(node, 'zIndex', 'auto');
        if (z && z !== 'auto') { best = z; break; }
        node = node.parentElement;
    }
    return best;
}
