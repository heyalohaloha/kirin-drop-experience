import {renderDropPage} from './page.mjs';
// Separate document for CSS/WASM isolation, presented in-place on the OS page.
// Only this document permits same-origin embedding; standalone Drop stays DENY.
export function renderOsDropDocument(language) {
  return renderDropPage(language)
    .replace('<body data-kirin-stone="true">','<body data-kirin-stone="true" data-embedded="true" data-input-state="idle">')
    .replaceAll('<a ','<a target="_parent" ');
}
export function renderOsDropEmbed(language) {
  const ja=language==='ja';
  return `<iframe id="kirin-drop-frame" title="${ja?'Kirin OSの音源測定を体験':'Experience Kirin OS audio measurement'}" src="${ja?'/ja':''}/os/experience" sandbox="allow-scripts allow-same-origin allow-top-navigation-by-user-activation" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
}
