'use strict';
/* Окно «Сообщить об ошибке». Всё, что показываем, — через textContent. */
(async () => {
  const $ = id => document.getElementById(id);
  const d = await window.bugReport.data();
  if (!d) return;
  const t = d.t, p = d.payload, crash = d.kind === 'crash';
  document.documentElement.dataset.theme = d.dark ? 'dark' : 'light';
  if (/^#[0-9a-f]{6}$/i.test(d.accent || '')) document.documentElement.style.setProperty('--acc', d.accent);
  document.documentElement.lang = /[а-я]/i.test(t.title) ? 'ru' : 'en';
  const fill = (id, s) => { $(id).textContent = s; };
  document.title = (crash ? t.crashTitle : t.title) + ' — ' + d.name;
  fill('h', crash ? t.crashTitle : t.title);
  fill('lead', crash ? t.crashLead : t.lead.replace('{name}', d.name));
  fill('l-msg', crash ? t.crashMessage : t.message);
  $('msg').placeholder = crash ? '' : t.messagePh;
  fill('l-contact', t.contact); $('contact').placeholder = t.contactPh;
  fill('l-det', t.details); fill('det-note', t.detailsNote);
  fill('l-crumbs', t.crumbs); fill('l-errors', t.errors);
  fill('l-nomore', t.noMore); $('nomore-wrap').hidden = !crash;
  fill('send', crash ? t.crashSend : t.send); fill('cancel', crash ? t.crashCancel : t.cancel);
  fill('copy', t.copy); fill('close', t.close); fill('where', t.where);

  /* «Что ещё отправится» — ровно то, что уйдёт */
  const kv = $('kv');
  const pair = (k, v) => { if (!v) return; const w = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; w.append(dt, dd); kv.append(w); };
  const dur = s => s < 60 ? s + ' ' + t.sec : s < 3600 ? Math.round(s / 60) + ' ' + t.min : Math.floor(s / 3600) + ' ' + t.h + ' ' + Math.round(s % 3600 / 60) + ' ' + t.min;
  pair(t.program, d.name + ' ' + p.version);
  pair(t.system, p.os + ' · ' + p.runtime);
  pair(t.screen, p.screen);
  pair(t.uptime, dur(p.uptime));
  pair(t.lang, p.lang);
  for (const [k, v] of Object.entries(p.extra || {})) pair(k, v);
  const ago = s => { s = Math.abs(s); return s < 60 ? Math.round(s) + ' ' + t.sec : Math.floor(s / 60) + ' ' + t.min + ' ' + Math.round(s % 60) + ' ' + t.sec; };
  const log = (id, rows) => {
    const ol = $(id);
    if (!rows.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = t.none; ol.append(li); return; }
    rows.forEach(r => { const li = document.createElement('li'), tm = document.createElement('time'), sp = document.createElement('span'); tm.textContent = ago(r[0]); sp.textContent = r[1]; li.append(tm, sp); ol.append(li); });
  };
  log('crumbs', p.crumbs.slice().reverse());
  log('errors', p.errors.slice().reverse());
  if (crash) $('det').open = false;

  $('form').hidden = false;
  (crash ? $('send') : $('msg')).focus();

  const form = () => ({ message: $('msg').value, contact: $('contact').value, noMore: $('nomore').checked });
  const status = (s, bad) => { $('status').textContent = s || ''; $('status').classList.toggle('bad', !!bad); };
  let busy = false;
  $('send').addEventListener('click', async () => {
    if (busy) return;
    if (!crash && $('msg').value.trim().length < 3) { status(t.short, true); $('msg').focus(); return; }
    busy = true; $('send').disabled = true; status(t.sending);
    const r = await window.bugReport.send(form());
    busy = false; $('send').disabled = false;
    if (r && r.ok) { $('form').hidden = true; $('done').hidden = false; fill('done-text', t.sent.replace('{id}', r.id)); $('close').focus(); return; }
    const e = r && r.error;
    status(e === 'short' ? t.short : e === 'rate' ? t.rate : e === 'net' ? t.net : t.fail, true);
    $('copy').hidden = e === 'short';
  });
  $('copy').addEventListener('click', async () => { if (await window.bugReport.copy(form())) { fill('copy', t.copied); setTimeout(() => fill('copy', t.copy), 2000); } });
  $('cancel').addEventListener('click', () => window.bugReport.close(form()));
  $('close').addEventListener('click', () => window.bugReport.close());
  $('where').addEventListener('click', () => window.bugReport.site());
  $('msg').addEventListener('input', () => { if ($('status').classList.contains('bad')) status(''); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); window.bugReport.close(form()); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !$('form').hidden) { e.preventDefault(); $('send').click(); }
  });
})();
