/* ====================================
   VDTOR — Keyboard Shortcuts Module
   ==================================== */
'use strict';

const Keyboard = (() => {
  const handlers = {};

  function register(key, handler, description) {
    handlers[key.toLowerCase()] = { handler, description };
  }

  function init() {
    document.addEventListener('keydown', (e) => {
      // Skip if user is typing in an input
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = [
        e.ctrlKey || e.metaKey ? 'mod+' : '',
        e.shiftKey ? 'shift+' : '',
        e.altKey ? 'alt+' : '',
        e.key.toLowerCase()
      ].join('');

      if (handlers[key]) {
        e.preventDefault();
        handlers[key].handler(e);
      }
    });
  }

  return { register, init };
})();
