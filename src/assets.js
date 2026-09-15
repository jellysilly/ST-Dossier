/** Рисованные элементы дела. Всё inline — ни одного внешнего файла. */

/** Фильтры: зернистость бумаги и растекание чернил. Вставляется один раз. */
export const SVG_DEFS = `
<svg class="dsr-defs" aria-hidden="true" focusable="false">
  <defs>
    <filter id="dsrGrain">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <filter id="dsrInk">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
</svg>`;

/** Бабочка из заставки: тонкий контур и «клеверные» пятна на крыльях. */
export const BUTTERFLY = `
<svg class="dsr-butterfly" viewBox="0 0 200 180" aria-hidden="true" focusable="false">
  <g class="dsr-butterfly__wings">
    <g class="dsr-wing dsr-wing--l">
      <path d="M98,70 C80,30 40,18 22,36 C4,54 16,86 52,96 C70,101 90,92 98,78 Z"/>
      <path d="M98,92 C84,100 56,104 46,120 C36,136 54,154 74,146 C88,140 96,120 98,104 Z"/>
      <g class="dsr-clover">
        <circle cx="43" cy="60" r="8"/><circle cx="61" cy="60" r="8"/>
        <circle cx="52" cy="51" r="8"/><circle cx="52" cy="69" r="8"/>
      </g>
      <g class="dsr-clover">
        <circle cx="61" cy="124" r="6"/><circle cx="75" cy="124" r="6"/>
        <circle cx="68" cy="117" r="6"/><circle cx="68" cy="131" r="6"/>
      </g>
    </g>
    <g class="dsr-wing dsr-wing--r" transform="translate(200,0) scale(-1,1)">
      <path d="M98,70 C80,30 40,18 22,36 C4,54 16,86 52,96 C70,101 90,92 98,78 Z"/>
      <path d="M98,92 C84,100 56,104 46,120 C36,136 54,154 74,146 C88,140 96,120 98,104 Z"/>
      <g class="dsr-clover">
        <circle cx="43" cy="60" r="8"/><circle cx="61" cy="60" r="8"/>
        <circle cx="52" cy="51" r="8"/><circle cx="52" cy="69" r="8"/>
      </g>
      <g class="dsr-clover">
        <circle cx="61" cy="124" r="6"/><circle cx="75" cy="124" r="6"/>
        <circle cx="68" cy="117" r="6"/><circle cx="68" cy="131" r="6"/>
      </g>
    </g>
  </g>
  <ellipse class="dsr-body" cx="100" cy="103" rx="3.5" ry="36"/>
  <path class="dsr-antenna" d="M100,70 C96,54 88,44 77,37"/>
  <path class="dsr-antenna" d="M100,70 C104,54 112,44 123,37"/>
</svg>`;

export const KEY_ICON = `
<svg class="dsr-icon dsr-icon--key" viewBox="0 0 64 24" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/>
  <path d="M19.5,12 H58"/><path d="M50,12 V19"/><path d="M56,12 V17.5"/>
</svg>`;

export const LENS_ICON = `
<svg class="dsr-icon dsr-icon--lens" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <circle cx="10" cy="10" r="7"/><path d="M15.2,15.2 L22,22"/>
</svg>`;

export const FOLDER_ICON = `
<svg class="dsr-icon dsr-icon--folder" viewBox="0 0 48 40" aria-hidden="true" focusable="false">
  <path d="M3,9 h14 l4,5 h24 a2,2 0 0 1 2,2 v19 a2,2 0 0 1 -2,2 h-40 a2,2 0 0 1 -2,-2 v-24 a2,2 0 0 1 2,-2 z"/>
  <path d="M3,17 h42"/>
</svg>`;

/** Круглая печать «после прочтения сжечь». */
export const STAMP = `
<svg class="dsr-stamp-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <circle cx="60" cy="60" r="52"/><circle cx="60" cy="60" r="44"/>
  <path d="M28,60 h64" />
  <text x="60" y="52" text-anchor="middle">СОВ.</text>
  <text x="60" y="80" text-anchor="middle">СЕКРЕТНО</text>
</svg>`;

/** Рваный нижний край листа. */
export const TORN_EDGE = `
<svg class="dsr-torn" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <path d="M0,0 L300,0 L300,6 L288,9 L272,4 L256,10 L240,5 L221,11 L203,4 L186,9 L168,3 L150,10 L132,5 L114,10 L96,4 L78,9 L60,3 L42,10 L24,5 L8,9 L0,5 Z"/>
</svg>`;
