// Interface text. Every word the player sees lives in js/locales/<lang>.js; this file picks the language and fills the page.
// The language follows the browser until the player picks one, and the pick is remembered when storage is allowed.
(function (root) {
  'use strict';
  const I = {
    packs: {},
    order: ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'fr', 'de', 'es', 'ru'],
    names: { 'en': 'English', 'zh-CN': '简体中文', 'zh-TW': '繁體中文', 'ja': '日本語', 'ko': '한국어', 'fr': 'Français', 'de': 'Deutsch', 'es': 'Español', 'ru': 'Русский' },
    fallback: 'en',
    lang: 'en',
    storeKey: 'sailLang'
  };
  I.register = function (lang, dict) { I.packs[lang] = Object.assign(I.packs[lang] || {}, dict); };

  function stored() { try { return localStorage.getItem(I.storeKey); } catch (e) { return null; } }
  function fromBrowser() {
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || I.fallback]);
    for (let i = 0; i < list.length; i++) {
      const low = String(list[i]).toLowerCase();
      if (low.startsWith('zh')) return /tw|hk|mo|hant/.test(low) ? 'zh-TW' : 'zh-CN';
      const base = low.split('-')[0];
      if (I.packs[base]) return base;
    }
    return I.fallback;
  }
  I.detect = function () { const s = stored(); return s && I.packs[s] ? s : fromBrowser(); };
  I.setLang = function (lang, remember) {
    I.lang = I.packs[lang] ? lang : I.fallback;
    if (remember) { try { localStorage.setItem(I.storeKey, I.lang); } catch (e) { /* storage blocked */ } }
    document.documentElement.lang = I.lang;
    I.apply(document);
  };

  // t('key', {n: 3}) fills {n}; a missing key falls back to English, then shows the key itself so gaps are visible
  I.t = function (key, vars) {
    let s = I.packs[I.lang] && I.packs[I.lang][key];
    if (s === undefined) s = I.packs[I.fallback] && I.packs[I.fallback][key];
    if (s === undefined) return key;
    if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return s;
  };
  I.has = function (key) { return !!((I.packs[I.lang] && I.packs[I.lang][key] !== undefined) || (I.packs[I.fallback] && I.packs[I.fallback][key] !== undefined)); };

  // data-i18n sets text, data-i18n-html sets markup from the pack (the packs are ours), data-i18n-title sets the tooltip
  I.apply = function (scope) {
    scope.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = I.t(el.dataset.i18n); });
    scope.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = I.t(el.dataset.i18nHtml); });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = I.t(el.dataset.i18nTitle); });
    document.title = I.t('doc.title');
  };

  root.SailI18n = I;
})(window);
