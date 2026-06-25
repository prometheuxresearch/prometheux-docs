(function () {
  'use strict';

  var PAGEFIND_JS = '/pagefind/pagefind-ui.js';
  var PAGEFIND_CSS = '/pagefind/pagefind-ui.css';

  var loadPromise = null;
  var uiReady = false;

  function loadPagefindUI() {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = PAGEFIND_CSS;
      document.head.appendChild(link);

      var s = document.createElement('script');
      s.src = PAGEFIND_JS;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return loadPromise;
  }

  function ensureModal() {
    var modal = document.getElementById('px-search-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'px-search-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="px-search-backdrop" data-close></div>' +
      '<div class="px-search-panel"><div id="px-search-host"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-close') !== null) {
        closeModal();
      }
    });
    return modal;
  }

  function openModal() {
    var modal = ensureModal();
    modal.classList.add('open');
    document.documentElement.classList.add('px-search-open');
    loadPagefindUI().then(function () {
      if (!uiReady) {
        // eslint-disable-next-line no-undef
        new PagefindUI({
          element: '#px-search-host',
          showSubResults: true,
          showImages: false,
          resetStyles: true,
          autofocus: true,
          translations: { placeholder: 'Search docs…' },
        });
        uiReady = true;
      }
      setTimeout(function () {
        var input = modal.querySelector('.pagefind-ui__search-input');
        if (input) input.focus();
      }, 50);
    });
  }

  function closeModal() {
    var modal = document.getElementById('px-search-modal');
    if (!modal) return;
    modal.classList.remove('open');
    document.documentElement.classList.remove('px-search-open');
  }

  document.addEventListener(
    'keydown',
    function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        openModal();
        return;
      }
      if (e.key === 'Escape') {
        var modal = document.getElementById('px-search-modal');
        if (modal && modal.classList.contains('open')) {
          e.preventDefault();
          e.stopPropagation();
          closeModal();
        }
      }
    },
    true
  );

  document.addEventListener(
    'click',
    function (e) {
      var trigger =
        e.target.closest &&
        e.target.closest('#search-bar-entry, #search-bar-entry-mobile, [aria-label="Open search"]');
      if (trigger) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        openModal();
      }
    },
    true
  );

  // Navigating to a result inside Pagefind UI: close the modal on link click
  document.addEventListener('click', function (e) {
    var modal = document.getElementById('px-search-modal');
    if (!modal || !modal.classList.contains('open')) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (a && a.href && !a.target) closeModal();
  });
})();
