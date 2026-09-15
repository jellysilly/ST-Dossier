/** Крошечный словарь. Русский — основной, английский — запасной. */

const DICT = {
    ru: {
        title: 'ДЕЛО', caseFile: 'Архивное дело', archive: 'АРХИВ', timeline: 'ХРОНОЛОГИЯ',
        cast: 'ЛИЦА', settings: 'РЕЖИМ', scan: 'СНЯТЬ ПОКАЗАНИЯ', scanning: 'ИДЁТ РАЗБОР…',
        burn: 'ПОСЛЕ ПРОЧТЕНИЯ СЖЕЧЬ', noData: 'НЕТ ДАННЫХ', empty: 'Дело пусто. Материалы появятся по ходу беседы.',
        emptyTime: 'Хронология не начата.', emptyCast: 'Фигуранты не установлены.',
        pin: 'Закрепить', unpin: 'Открепить', del: 'Уничтожить', edit: 'Правка',
        search: 'Поиск по делу', filterAll: 'Всё', filterPinned: 'Закреплённые',
        setStart: 'Задать начало', parsing: 'Разбор',
        nameLabel: 'Имя', mentions: 'Упоминаний',
        addFact: 'Вписать вручную', elapsed: 'Прошло', now: 'Сейчас', place: 'Место',
        apiSection: 'Источник разбора', apiMain: 'Основной API чата',
        apiProfile: 'Отдельный профиль подключения', profile: 'Профиль',
        noProfiles: 'Профили не найдены — создайте их в Connection Profiles',
        autoScan: 'Автоматический разбор', everyN: 'Разбирать каждые N сообщений',
        maxMsg: 'Сообщений за один разбор', maxChars: 'Символов из сообщения',
        minImp: 'Минимальная важность факта', trackTime: 'Вести хронологию',
        startDate: 'Начальная дата (необязательно)', inject: 'Подмешивать память в промпт',
        injectDepth: 'Глубина вставки', injectMax: 'Фактов в промпте',
        anim: 'Анимации', maxTokens: 'Лимит ответа (токены)', usePreset: 'Применять пресет профиля',
        exportBtn: 'Выгрузить', importBtn: 'Загрузить', wipe: 'Сжечь дело',
        wipeConfirm: 'Уничтожить все материалы этого дела? Действие необратимо.',
        saved: 'Записано', scanDone: 'Разбор окончен: новых фактов —', scanNone: 'Новых материалов нет',
        scanFail: 'Разбор сорвался', noChat: 'Чат не открыт', busy: 'Разбор уже идёт',
        openCase: 'Открыть дело', close: 'Закрыть', importance: 'Важность',
        kindEvent: 'событие', kindFact: 'факт', kindRelation: 'связь', kindPlace: 'место',
        kindItem: 'предмет', kindPromise: 'обещание', kindSecret: 'тайна',
        unprocessed: 'не разобрано', factsTotal: 'материалов', scenes: 'эпизодов',
        min: 'мин', hour: 'ч', day: 'д', manualFact: 'Текст материала:',
        newDate: 'Начальная дата / время мира:', reset: 'Сбросить позицию окна',
    },
    en: {
        title: 'CASE', caseFile: 'Case file', archive: 'ARCHIVE', timeline: 'TIMELINE',
        cast: 'CAST', settings: 'SETUP', scan: 'TAKE STATEMENT', scanning: 'PARSING…',
        burn: 'BURN AFTER READING', noData: 'NO DATA', empty: 'Case is empty. Material appears as you talk.',
        emptyTime: 'Timeline not started.', emptyCast: 'No persons of interest yet.',
        pin: 'Pin', unpin: 'Unpin', del: 'Destroy', edit: 'Edit',
        search: 'Search the case', filterAll: 'All', filterPinned: 'Pinned',
        setStart: 'Set start', parsing: 'Parsing',
        nameLabel: 'Name', mentions: 'Mentions',
        addFact: 'Add manually', elapsed: 'Elapsed', now: 'Now', place: 'Place',
        apiSection: 'Parsing source', apiMain: 'Main chat API',
        apiProfile: 'Separate connection profile', profile: 'Profile',
        noProfiles: 'No profiles found — create them in Connection Profiles',
        autoScan: 'Automatic parsing', everyN: 'Parse every N messages',
        maxMsg: 'Messages per scan', maxChars: 'Chars taken per message',
        minImp: 'Minimum fact importance', trackTime: 'Track chronology',
        startDate: 'Start date (optional)', inject: 'Inject memory into prompt',
        injectDepth: 'Injection depth', injectMax: 'Facts in prompt',
        anim: 'Animations', maxTokens: 'Response limit (tokens)', usePreset: 'Apply profile preset',
        exportBtn: 'Export', importBtn: 'Import', wipe: 'Burn the case',
        wipeConfirm: 'Destroy all material in this case? This cannot be undone.',
        saved: 'Saved', scanDone: 'Parsing done, new facts:', scanNone: 'Nothing new found',
        scanFail: 'Parsing failed', noChat: 'No chat open', busy: 'Already parsing',
        openCase: 'Open case', close: 'Close', importance: 'Importance',
        kindEvent: 'event', kindFact: 'fact', kindRelation: 'bond', kindPlace: 'place',
        kindItem: 'item', kindPromise: 'promise', kindSecret: 'secret',
        unprocessed: 'unparsed', factsTotal: 'items', scenes: 'scenes',
        min: 'min', hour: 'h', day: 'd', manualFact: 'Material text:',
        newDate: 'Start date / world time:', reset: 'Reset window position',
    },
};

let lang = 'ru';

export function initLocale(preferred) {
    if (preferred && DICT[preferred]) { lang = preferred; return lang; }
    try {
        const stLocale = SillyTavern.getContext().getCurrentLocale?.() || '';
        lang = String(stLocale).startsWith('ru') ? 'ru' : 'en';
    } catch { lang = 'ru'; }
    return lang;
}

export function T(key) {
    return DICT[lang]?.[key] ?? DICT.ru[key] ?? key;
}
