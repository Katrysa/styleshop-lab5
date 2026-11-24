'use strict';
/* svg.js — генерація SVG-зображень одягу за формою та кольором */
const SHAPES = {
  tshirt: 'M120 90 L170 70 Q200 100 230 70 L280 90 L335 145 L295 180 L272 158 L272 410 L128 410 L128 158 L105 180 L65 145 Z',
  shirt: 'M120 90 L170 70 L200 105 L230 70 L280 90 L335 145 L295 180 L272 158 L272 410 L128 410 L128 158 L105 180 L65 145 Z',
  pants: 'M140 70 H260 L292 430 H215 L200 210 L185 430 H108 Z',
  jeans: 'M140 70 H260 L292 430 H215 L200 210 L185 430 H108 Z',
  dress: 'M165 70 L235 70 L252 150 L305 420 H95 L148 150 Z',
  jacket: 'M112 90 L170 68 Q200 92 230 68 L288 90 L345 340 L303 350 L276 190 L276 415 L124 415 L124 190 L97 350 L55 340 Z',
  sweater: 'M115 90 L170 70 Q200 100 230 70 L285 90 L345 340 L303 350 L276 190 L276 415 L124 415 L124 190 L97 350 L55 340 Z',
  bag: 'M110 175 H290 L305 420 H95 Z',
};
const DETAIL = {
  shirt: '<path d="M200 105 V410" stroke="#29241F" stroke-opacity=".35" stroke-width="3"/>',
  jeans: '<path d="M150 100 H250 M200 100 V210 M150 100 Q165 135 190 130 M250 100 Q235 135 210 130" fill="none" stroke="#F5F0E7" stroke-opacity=".7" stroke-width="3" stroke-dasharray="6 5"/>',
  jacket: '<path d="M200 90 V415" stroke="#29241F" stroke-opacity=".4" stroke-width="4"/><rect x="124" y="395" width="152" height="20" fill="#29241F" fill-opacity=".25"/>',
  sweater: '<rect x="124" y="392" width="152" height="23" fill="#29241F" fill-opacity=".2"/>',
  bag: '<path d="M155 175 V130 Q155 100 200 100 Q245 100 245 130 V175" fill="none" stroke="#29241F" stroke-width="10" stroke-linecap="round"/>',
  dress: '<path d="M148 150 L252 150" stroke="#29241F" stroke-opacity=".3" stroke-width="6"/>',
};
const SHAPE_KEYS = Object.keys(SHAPES);

/* hex перевіряється регулярним виразом, тому вставка у розмітку SVG безпечна */
function render(shape, hex) {
  const safeShape = SHAPES[shape] ? shape : 'tshirt';
  const safeHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#C9B79C';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500">' +
    '<rect width="400" height="500" fill="#EAE0D2"/>' +
    `<path d="${SHAPES[safeShape]}" fill="${safeHex}" stroke="#29241F" stroke-opacity=".25" stroke-width="2" stroke-linejoin="round"/>` +
    (DETAIL[safeShape] || '') + '</svg>';
}
module.exports = { SHAPE_KEYS, render };
