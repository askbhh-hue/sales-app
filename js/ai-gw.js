/* =====================================================================
   ai-gw.js  -  Phase 3: use the AI through the Supabase "ai-gateway" function instead of keys stored in the browser.
   - Needs cloud.js (login). Off by default: FLAGS.useServerAI = false.
   - When ON: the existing assistant (axAgent / tools / local rules) keeps working exactly the same,
     only the model call goes to the server. Customer names are still hidden first if "aiHideNames" is on.
   - When OFF (or logged out): nothing changes, the old browser-key flow works as before.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__gwLoaded) return;
  window.__gwLoaded = true;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FN = 'rapid-action';   // slug of the deployed Supabase function (it was auto-named; the code inside is ai-gateway)
  const GW = window.GW = { busy: false, msg: '', last: null, st: null };
  const on = () => !!(window.FLAGS && FLAGS.useServerAI && window.CL && CL.logged && CL.logged());
  const redraw = () => { try { if (typeof v !== 'undefined' && v && v.cloud) render(); } catch (_) {} };

  async function gw(body, retry) {
    await CL.ensureTok();
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 70000);
    let r;
    try {
      r = await fetch(CL.base + '/functions/v1/' + FN + '', { method: 'POST', signal: ac.signal,
        headers: { apikey: CL.key, Authorization: 'Bearer ' + CL.tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } finally { clearTimeout(t); }
    if (r.status === 401 && retry !== false) { CL.exp = 0; return gw(body, false); }
    const j = await r.json().catch(() => ({}));
    return { status: r.status, j };
  }
  function explain(status, j) {
    const e = (j && j.error) || '';
    if (status === 401) return 'سجّل دخول السحابة الأول (المزيد > السحابة)';
    if (status === 429 && e === 'quota_exceeded') return 'وصلت للحد اليومي من الذكاء الاصطناعي، جرّب بكرة';
    if (status === 503) return 'السيرفر لسه مفيهوش مفاتيح ذكاء اصطناعي';
    if (status === 404) return 'خدمة الذكاء الاصطناعي على السيرفر مش متفعّلة لسه';
    if (status === 502 && e === 'all_failed') return 'كل المزوّدين مشغولين دلوقتي، جرّب بعد شوية (' + ((j.tried || []).map(x => x.provider + ':' + x.status).join('، ')) + ')';
    return 'الخدمة رجعت خطأ ' + status + (e ? ': ' + e : '');
  }

  // ---------- the model call used by the assistant (same OpenAI-style answer the app already understands) ----------
  function attach() {
    const _axCall = axCall;
    axCall = async function (prov, key, msgs) {
      if (!on()) return _axCall.apply(this, arguments);
      if (S.aiHideNames && msgs) { try { msgs = JSON.parse(axRedact(JSON.stringify(msgs))); } catch (_) {} }
      let res;
      try {
        res = await gw({ messages: [{ role: 'system', content: axSys() }].concat(msgs),
          tools: AXT.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
          tool_choice: 'auto', temperature: 0, max_tokens: 1500 });
      } catch (er) {
        const m = new Error(er.name === 'AbortError' ? 'الرد أخد وقت طويل، جرّب تاني' : er.message === 'NOLOGIN' ? 'سجّل دخول السحابة الأول (المزيد > السحابة)' : 'مفيش اتصال بالإنترنت');
        m.net = er.name !== 'AbortError' && er.message !== 'NOLOGIN'; throw m;
      }
      if (res.status !== 200) throw new Error(explain(res.status, res.j));
      GW.last = res.j._gw || null;
      return res.j;
    };
    const _aiProv = aiProv; aiProv = function () { return on() ? 'openai' : _aiProv(); };
    const _aiModel = aiModel; aiModel = function () { return on() ? 'server' : _aiModel(); };
    const _axQueue = axQueue; axQueue = function () { return on() ? [] : _axQueue.apply(this, arguments); };
    const _aiStatus = aiStatus;
    aiStatus = function () {
      if (!on()) return _aiStatus();
      const g = GW.last; return '🟢 الذكاء الاصطناعي شغال من السيرفر' + (g ? ' (' + esc(g.provider) + ')' : '') + '، من غير أي مفتاح على الجهاز.';
    };
    const _aiAsk = aiAsk;
    aiAsk = function (t) {
      if (!on()) return _aiAsk.apply(this, arguments);
      t = String(t == null ? '' : t).trim(); if (!t) return;
      const multi = (t.match(/(حصل|حصّل|سجل|سجّل|ابعت|افتح|بعت|ضيف|غير|امسح|زود|وصل|وريني|روح|خلي|اعمل)/g) || []).length >= 2 || /(ثم|وبعدين|وبعد كده|وبعدها)/.test(t);
      aiMsgs.push({ me: 1, h: e(t) });
      if (navigator.onLine === false) { let l = null; try { l = aiLocal(t); } catch (_) {} aiMsgs.push({ bot: 1, h: l != null ? l : AI_HELP }); return aiRender(); }
      if (S.agAlways || multi) return axAgent(t, 'server');
      let local = null; try { local = aiLocal(t); } catch (er) { console.error('aiLocal', er); }
      if (local !== null && local !== undefined) { aiMsgs.push({ bot: 1, h: local }); return aiRender(); }
      return axAgent(t, 'server');
    };
  }

  // ---------- settings card on the cloud screen ----------
  async function test() {
    if (GW.busy) return; GW.busy = true; GW.msg = '⏳ بجرّب السيرفر…'; redraw();
    try {
      if (!CL.logged()) throw new Error('سجّل دخول السحابة الأول');
      const s = await gw({ action: 'status' });
      if (s.status === 404) throw new Error('الدالة ai-gateway لسه مش متنشرة على Supabase');
      if (s.status !== 200) throw new Error(explain(s.status, s.j));
      GW.st = s.j;
      if (!s.j.configured.length) throw new Error('الدالة شغالة بس مفيش مفاتيح متسجلة (Secrets)');
      const r = await gw({ messages: [{ role: 'user', content: 'رد بكلمة واحدة بس: تمام' }], max_tokens: 30 });
      if (r.status !== 200) throw new Error(explain(r.status, r.j));
      const g = r.j._gw || {}; GW.last = g;
      GW.msg = '✔ شغّال. رد عليّ ' + g.provider + ' في ' + g.ms + ' ملي ثانية' + ((g.tried || []).length ? ' (بعد ما ' + g.tried.map(x => x.provider).join('، ') + ' فشلوا)' : '') + '. المتاح: ' + s.j.configured.join('، ');
      GW.ok = true;
    } catch (er) { GW.ok = false; GW.msg = '✘ ' + (er.message === 'NOLOGIN' ? 'سجّل دخول السحابة الأول' : er.message || 'مشكلة'); }
    GW.busy = false; redraw();
  }
  async function toggle() {
    if (FLAGS.useServerAI) { CL.setFlag('useServerAI', false); GW.msg = 'رجعنا للطريقة القديمة (مفتاح الجهاز).'; return redraw(); }
    await test();
    if (GW.ok) { CL.setFlag('useServerAI', true); GW.msg += ' — اتفعّل ✅'; }
    redraw();
  }
  GW.test = test; GW.toggle = toggle; GW.on = on;

  function card() {
    const f = !!FLAGS.useServerAI;
    return `<div class="card"><b>🤖 الذكاء الاصطناعي من السيرفر</b>
      <div class="mu" style="margin:6px 0">المفاتيح محفوظة على Supabase بس، مش على الجهاز. بيجرّب Gemini وبعده Groq وبعده OpenRouter (كلهم مجاني).</div>
      <div style="margin:6px 0">${f ? '<span class="grn">✅ شغّال</span>' : '<span class="mu">⏸ موقوف (بيستخدم الطريقة القديمة)</span>'}</div>
      ${GW.msg ? '<div class="mu" style="margin:6px 0">' + esc(GW.msg) + '</div>' : ''}
      <button class="btn t" onclick="GW.test()">🧪 جرّب السيرفر</button>
      <button class="btn" onclick="GW.toggle()">${f ? '⏸ وقّف الذكاء من السيرفر' : '▶️ شغّل الذكاء من السيرفر'}</button></div>`;
  }

  try {
    if (!window.CL) throw new Error('cloud.js missing');
    if (FLAGS.useServerAI === undefined) FLAGS.useServerAI = false;
    attach();
    const _mv = mapView;
    mapView = function () { const h = _mv(); try { if (v && v.cloud) return h + card(); } catch (er) { console.error('[gw]', er); } return h; };
    console.log('🤖 ai-gw.js ready. useServerAI =', FLAGS.useServerAI);
  } catch (er) { console.error('[ai-gw.js] failed to attach, app continues unchanged:', er); }
})();
