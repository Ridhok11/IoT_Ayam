(() => {
  const KEY = 'iot-dht11-theme';
  const root = document.documentElement;
  function applyTheme(theme) {
    const selected = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', selected);
    try { localStorage.setItem(KEY, selected); } catch (_) {}
    const button = document.getElementById('themeToggle');
    if (button) {
      const dark = selected === 'dark';
      button.setAttribute('aria-pressed', String(dark));
      button.innerHTML = `<span class="theme-toggle-label">${dark ? '🌙 Mode Gelap' : '☀️ Mode Terang'}</span><span class="theme-toggle-state">${dark ? 'Beralih ke terang' : 'Beralih ke gelap'}</span>`;
    }
  }
  function addToggle() {
    if (document.getElementById('themeToggle')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.id = 'themeToggle'; button.className = 'theme-toggle';
    button.setAttribute('aria-label', 'Ganti tema terang atau gelap');
    button.addEventListener('click', () => applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
    const host = document.querySelector('.sidebar .sidebar-footer') || document.querySelector('.sidebar') || document.querySelector('aside') || document.querySelector('nav') || document.querySelector('header') || document.body;
    host.appendChild(button); applyTheme(root.getAttribute('data-theme') || 'light');
  }
  let saved = 'light'; try { saved = localStorage.getItem(KEY) || 'light'; } catch (_) {}
  applyTheme(saved);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addToggle, {once:true}); else addToggle();
})();
