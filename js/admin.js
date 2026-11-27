// Anju Farm staging: one authentication controller, no legacy post API calls.
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const notice = (message, error = false) => {
    const target = el('notice');
    if (!target) return;
    target.textContent = message;
    target.className = error ? 'admin-error' : 'admin-note';
  };
  async function request(url, options = {}) {
    let response;
    try { response = await fetch(url, { credentials: 'same-origin', ...options }); }
    catch { throw new Error('Unable to connect to the administration API.'); }
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { throw new Error(`API returned an unexpected response (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status})`);
    return data;
  }
  function show(authenticated) {
    el('login-section').hidden = authenticated;
    el('cms-section').hidden = !authenticated;
    el('editor-section').hidden = true;
  }
  let pending = false;
  el('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    const button = el('login-form').querySelector('[type="submit"]');
    if (button) button.disabled = true;
    notice('Signing in…');
    try {
      await request('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: el('password').value })
      });
      el('password').value = '';
      // Reload ensures the independently initialized CMS and media modules
      // request protected data only after the session cookie is established.
      location.reload();
    } catch (error) {
      notice(error.message, true);
    } finally {
      pending = false;
      if (button) button.disabled = false;
    }
  });
  async function logout() {
    if (pending) return;
    pending = true;
    try {
      await request('/api/admin/logout', { method: 'POST' });
      location.reload();
    } catch (error) {
      notice(error.message, true);
    } finally { pending = false; }
  }
  el('cms-logout')?.addEventListener('click', logout);
  el('logout')?.addEventListener('click', logout);
  (async () => {
    try {
      const session = await request('/api/admin/session');
      show(Boolean(session.authenticated));
      if (session.authenticated) notice('');
    } catch (error) {
      show(false);
      notice(error.message, true);
      console.error('Admin session check failed:', error);
    }
  })();
})();
