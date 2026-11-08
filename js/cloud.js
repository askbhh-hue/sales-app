/* =====================================================================
   cloud.js  -  Phase 2: mirror (dual-write) of the local data to Supabase.
   - The LOCAL data (localStorage `fs_v1`) stays the source of truth. This file only copies changes to the cloud.
   - Kill switch: FLAGS.dualWrite = false  (screen: المزيد > السحابة). Removing the <script> tag removes everything.
   - No secrets: only the public publishable key + the user's own session token.
   - The PIN, AI keys and AI logs are NEVER sent (only the whitelisted collections below).
   ===================================================================== */
(function () {
  'use strict';
  if (window.__cloudLoaded) return;
  window.__cloudLoaded = true;

  const SB_URL = 'https://hioringmhouagmmtvdcp.supabase.co';
  const SB_KEY = 'sb_publishable_e5H7PWboRr_GyJXrOug3xA_Zen409zF';
  const CK = 'fs_cloud', SK = 'fs_cloud_snap';
  const KEYS = ['customers', 'products', 'orders', 'ledger', 'visits', 'pv', 'places', 'exp', 'returns', 'prom'];
  const SIZE = { customers: 200, products: 150, orders: 200, ledger: 500, visits: 500, pv: 500, places: 500, exp: 500, returns: 200, prom: 500 };
  const LABELS = { customers: 'العملاء', products: 'المنتجات', batches: 'التشغيلات', orders: 'الطلبات', orders_cancelled: 'الطلبات الملغية',
    order_items: 'أصناف الطلبات', ledger: 'حركات الحساب', visits: 'الزيارات', village_visits: 'زيارات القرى', places: 'الأماكن',
    expenses: 'المصاريف', returns: 'المرتجعات', promises: 'وعود الدفع' };

  const A = x => Array.isArray(x) ? x : [];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r2 = n => Math.round(n * 100) / 100;
  const fmt = n => Number(n).toLocaleString('en-US');
  const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function hash(str) { // cyrb53: fast 53-bit string hash
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // ---------------- flags ----------------
  if (typeof FLAGS === 'object' && FLAGS && FLAGS.dualWrite === undefined) FLAGS.dualWrite = false;
  function setFlag(k, val) {
    FLAGS[k] = !!val;
    try { const o = JSON.parse(localStorage.getItem('fs_flags') || '{}'); o[k] = !!val; localStorage.setItem('fs_flags', JSON.stringify(o)); } catch (_) {}
  }

  // ---------------- persisted config (refresh token only; the password is never stored) ----------------
  let _cfg = null;
  const cfg = () => { if (!_cfg) { try { _cfg = JSON.parse(localStorage.getItem(CK)) || {}; } catch (_) { _cfg = {}; } } return _cfg; };
  const setCfg = c => { _cfg = c; try { localStorage.setItem(CK, JSON.stringify(c)); } catch (_) {} };
  const patchCfg = o => setCfg(Object.assign({}, cfg(), o));
  let _snap = null;
  function loadSnap() {
    if (!_snap) { try { _snap = JSON.parse(localStorage.getItem(SK)) || {}; } catch (_) { _snap = {}; } }
    return _snap.__uid && _snap.__uid === cfg().uid ? _snap : {};
  }
  function saveSnap(next) { next.__uid = cfg().uid; _snap = next; try { localStorage.setItem(SK, JSON.stringify(next)); } catch (_) {} }

  const CL = window.CL = { tok: null, exp: 0, busy: false, again: false, timer: null, retry: 0, msg: '', rec: null, loginEm: '', loginPw: '', loginBusy: false };
  const redraw = () => { try { if (typeof v !== 'undefined' && v && v.cloud) render(); } catch (_) {} };

  // ---------------- network ----------------
  async function http(path, opt, timeout) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout || 30000);
    try { return await fetch(SB_URL + path, Object.assign({}, opt, { signal: ac.signal })); } finally { clearTimeout(t); }
  }
  async function authCall(grant, body) {
    const r = await http('/auth/v1/token?grant_type=' + grant, { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const er = new Error(j.msg || j.error_description || j.message || ('HTTP ' + r.status)); er.status = r.status; throw er; }
    CL.tok = j.access_token; CL.exp = Date.now() + ((j.expires_in || 3600) * 1000) - 60000;
    patchCfg({ rt: j.refresh_token, em: (j.user && j.user.email) || cfg().em || '', uid: (j.user && j.user.id) || cfg().uid || '' });
    return j;
  }
  let _refreshing = null;
  function refreshTok() {
    if (_refreshing) return _refreshing;
    const rt = cfg().rt; if (!rt) return Promise.reject(new Error('NOLOGIN'));
    _refreshing = authCall('refresh_token', { refresh_token: rt }).catch(er => {
      if (er.status === 400 || er.status === 401 || er.status === 403) { patchCfg({ rt: '' }); CL.tok = null; throw new Error('NOLOGIN'); }
      throw er;
    }).finally(() => { _refreshing = null; });
    return _refreshing;
  }
  async function ensureTok() { if (!CL.tok || Date.now() >= CL.exp) await refreshTok(); }
  async function rpc(name, args, retry) {
    await ensureTok();
    const r = await http('/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + CL.tok, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
    if (r.status === 401 && retry !== false) { CL.exp = 0; return rpc(name, args, false); }
    const j = await r.json().catch(() => null);
    if (!r.ok) { const er = new Error((j && (j.message || j.hint || j.error)) || ('HTTP ' + r.status)); er.status = r.status; throw er; }
    return j;
  }
  const isOffline = er => er && (er.name === 'AbortError' || er instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(er.message || ''));

  // ---------------- diff: what changed since the last successful sync ----------------
  const settingsOf = () => ({ cyc: S.cyc, home: S.home, aiHideNames: S.aiHideNames });
  function diff(full) {
    const prev = full ? {} : loadSnap(), next = {}, up = {}, del = {};
    let nUp = 0, nDel = 0;
    for (const k of KEYS) {
      const pm = prev[k] || {}, nm = {}, rows = [];
      for (const r of A(S[k])) {
        if (!r || r.id === undefined || r.id === null || String(r.id) === '') continue;
        const id = String(r.id);
        if (id in nm) continue;                       // duplicate id: first one wins (same rule as the import)
        const h = hash(JSON.stringify(r));
        nm[id] = h; if (pm[id] !== h) rows.push(r);
      }
      const gone = Object.keys(pm).filter(id => !(id in nm));
      next[k] = nm;
      if (rows.length) { up[k] = rows; nUp += rows.length; }
      if (gone.length) { del[k] = gone; nDel += gone.length; }
    }
    const pb = prev.batches || {}, nb = {};
    for (const p of A(S.products)) for (const b of A(p && p.batches)) if (b && b.id !== undefined && b.id !== null) nb[String(b.id)] = 1;
    const gb = Object.keys(pb).filter(id => !(id in nb));
    next.batches = nb; if (gb.length) { del.batches = gb; nDel += gb.length; }
    const sh = hash(JSON.stringify(settingsOf())); next.settings = sh;
    return { up, del, next, nUp, nDel, settings: prev.settings !== sh ? settingsOf() : null };
  }
  function pending() { try { const d = diff(); return d.nUp + d.nDel + (d.settings ? 1 : 0); } catch (_) { return 0; } }

  // ---------------- sync ----------------
  function schedule(ms) { clearTimeout(CL.timer); CL.timer = setTimeout(() => sync(), ms === undefined ? 2500 : ms); }
  function fail(er) {
    let m, again = true;
    if (er.message === 'NOLOGIN') { m = 'لازم تسجّل دخول تاني'; again = false; }
    else if (isOffline(er)) m = 'مفيش نت دلوقتي، هنعيد المحاولة لوحدنا';
    else m = er.message || 'خطأ غير معروف';
    patchCfg({ err: m }); CL.msg = '';
    if (again) { const wait = [30000, 120000, 600000][Math.min(CL.retry, 2)]; CL.retry++; schedule(wait); }
  }
  async function sync(opts) {
    opts = opts || {};
    if (!FLAGS.dualWrite && !opts.force) return { skipped: 'off' };
    if (CL.busy) { CL.again = true; return { skipped: 'busy' }; }
    CL.busy = true; redraw();
    try {
      if (!cfg().rt) throw new Error('NOLOGIN');
      const d = diff(!!opts.full);
      if (opts.full) {
        const ids = await rpc('cloud_legacy_ids');                       // clean-up: cloud rows that no longer exist locally
        for (const k of KEYS.concat(['batches'])) {
          const mine = new Set(Object.keys(d.next[k] || {}));
          const extra = A(ids[k]).filter(id => !mine.has(String(id)));
          if (extra.length) { d.del[k] = (d.del[k] || []).concat(extra); d.nDel += extra.length; }
        }
        d.settings = settingsOf();
      }
      if (!d.nUp && !d.nDel && !d.settings) { patchCfg({ last: Date.now(), err: '' }); CL.retry = 0; return { ok: true, sent: 0 }; }
      if (d.nDel) await rpc('sync_legacy', { p_data: {}, p_deletes: d.del });
      const steps = [];
      if (d.settings) steps.push({ settings: d.settings });
      for (const k of KEYS) if (d.up[k]) chunk(d.up[k], SIZE[k]).forEach(c => steps.push({ [k]: c }));
      for (const s of steps) await rpc('sync_legacy', { p_data: s, p_deletes: {} });
      saveSnap(d.next);
      patchCfg({ last: Date.now(), err: '' }); CL.retry = 0;
      return { ok: true, sent: d.nUp + d.nDel };
    } catch (er) { fail(er); return { error: er.message }; }
    finally { CL.busy = false; if (CL.again) { CL.again = false; schedule(1500); } redraw(); }
  }
  async function idle() { for (let i = 0; i < 60 && CL.busy; i++) await sleep(500); }

  // ---------------- verification (local vs cloud) ----------------
  const num = x => { if (x === null || x === undefined || x === '') return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
  const truthy = x => !(x === undefined || x === null || x === '' || x === false || x === 0 || x === '0' || x === 'false' || x === 'null');
  const uniq = arr => { const seen = new Set(), out = []; for (const x of arr) { const id = x && x.id; if (id === undefined || id === null || String(id) === '' || seen.has(String(id))) continue; seen.add(String(id)); out.push(x); } return out; };
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s));
  const posR2 = x => { const n = num(x); return n !== null && r2(n) > 0; };
  function expected() {   // same rules as the SQL (verified by tests)
    const cust = uniq(A(S.customers)), cids = new Set(cust.map(c => String(c.id)));
    const prods = uniq(A(S.products));
    const orders = uniq(A(S.orders)).filter(o => cids.has(String(o.cid)));
    const counts = {
      customers: cust.length, products: prods.length,
      batches: uniq(prods.flatMap(p => A(p.batches))).filter(b => validDate(b.exp)).length,
      orders: orders.length, orders_cancelled: orders.filter(o => truthy(o.cx)).length,
      order_items: orders.reduce((s, o) => s + A(o.items).filter(i => posR2(i.qty)).length, 0),
      ledger: uniq(A(S.ledger)).filter(l => cids.has(String(l.cid)) && (l.type === 'OWES' || l.type === 'PAID') && posR2(l.amt)).length,
      visits: uniq(A(S.visits)).filter(x => cids.has(String(x.cid))).length,
      village_visits: uniq(A(S.pv)).filter(x => String(x.vl || '').trim()).length,
      places: uniq(A(S.places)).filter(x => String(x.vl || '').trim()).length,
      expenses: uniq(A(S.exp)).filter(x => posR2(x.amt)).length,
      returns: uniq(A(S.returns)).filter(r => cids.has(String(r.cid))).length,
      promises: uniq(A(S.prom)).filter(p => cids.has(String(p.cid)) && num(p.due) > 0).length
    };
    const bal = new Map();
    A(S.ledger).forEach(l => bal.set(String(l.cid), (bal.get(String(l.cid)) || 0) + (l.type === 'OWES' ? Number(l.amt) : -Number(l.amt))));
    return { counts, balances: cust.map(c => ({ id: String(c.id), balance: r2(bal.get(String(c.id)) || 0) })) };
  }
  async function compare() {
    CL.rec = { busy: true }; redraw();
    try {
      if (FLAGS.dualWrite) { await idle(); await sync(); await idle(); }
      const e = expected(), c = await rpc('cloud_counts'), r = await rpc('reconcile_balances', { p_expected: e.balances });
      const rows = Object.keys(LABELS).map(k => ({ k, local: e.counts[k], cloud: c[k] ?? 0, ok: e.counts[k] === (c[k] ?? 0) }));
      const mm = A(r.mismatches), miss = A(r.missing_in_cloud);
      CL.rec = { at: Date.now(), rows, mm, miss, compared: r.compared, te: r.total_expected, ta: r.total_actual, ok: rows.every(x => x.ok) && !mm.length && !miss.length };
    } catch (er) { CL.rec = { err: er.message === 'NOLOGIN' ? 'سجّل دخول الأول' : isOffline(er) ? 'مفيش نت' : er.message }; }
    redraw();
  }

  // ---------------- actions used by the screen ----------------
  CL.login = async function () {
    if (CL.loginBusy) return; CL.loginBusy = true; CL.msg = '⏳ بسجّل دخول…'; redraw();
    try {
      await authCall('password', { email: (CL.loginEm || '').trim(), password: CL.loginPw || '' });
      CL.loginPw = ''; patchCfg({ err: '' }); CL.msg = '✔ تم الدخول';
    } catch (er) {
      CL.msg = /Invalid login credentials/i.test(er.message) ? '✘ الإيميل أو الباسورد غلط' : isOffline(er) ? '✘ مفيش نت' : '✘ ' + er.message;
    }
    CL.loginBusy = false; redraw();
  };
  CL.logout = function () {
    if (!confirm('تسجّل خروج من السحابة؟ المزامنة هتقف، وبيانات الجهاز مش هتتأثر.')) return;
    setFlag('dualWrite', false); patchCfg({ rt: '', err: '' }); CL.tok = null; clearTimeout(CL.timer); CL.msg = 'تم تسجيل الخروج'; redraw();
  };
  CL.toggle = function () {
    if (FLAGS.dualWrite) { setFlag('dualWrite', false); clearTimeout(CL.timer); CL.msg = 'المزامنة اتوقفت. التطبيق شغّال زي الأول.'; redraw(); return; }
    if (!cfg().rt) { CL.msg = 'سجّل دخول الأول'; redraw(); return; }
    setFlag('dualWrite', true); CL.msg = 'المزامنة اشتغلت'; sync(); redraw();
  };
  CL.syncNow = function () { if (!FLAGS.dualWrite) { CL.msg = 'شغّل المزامنة الأول'; redraw(); return; } sync().then(r => { CL.msg = r && r.error ? '' : '✔ تمت المزامنة'; redraw(); }); };
  CL.full = function () {
    if (!confirm('مزامنة كاملة: هتبعت كل بيانات الجهاز للسحابة، وتمسح من السحابة أي حاجة مش موجودة على الجهاز. بيانات الجهاز مش هتتغيّر. تكمّل؟')) return;
    if (!cfg().rt) { CL.msg = 'سجّل دخول الأول'; redraw(); return; }
    sync({ full: true, force: true }).then(r => { CL.msg = r && r.error ? '' : '✔ المزامنة الكاملة خلصت. دوس «قارن الأرقام».'; redraw(); });
  };
  CL.compare = compare;
  CL.touch = function () { if (FLAGS.dualWrite) schedule(2500); };
  CL._test = { sync, diff, expected, rpc, cfg };

  // ---------------- screen ----------------
  function cloudView() {
    const c = cfg(), on = !!FLAGS.dualWrite, logged = !!c.rt;
    const st = !logged ? '<span class="red">⚠ مش مسجّل دخول</span>'
      : c.err ? '<span class="red">❌ ' + esc(c.err) + '</span>'
      : on ? '<span class="grn">✅ المزامنة شغّالة</span>' : '<span class="mu">⏸ المزامنة موقوفة</span>';
    const rec = CL.rec;
    const recHtml = !rec ? '' : rec.busy ? '<div class="card">⏳ بقارن…</div>' : rec.err ? '<div class="card red">✘ ' + esc(rec.err) + '</div>' :
      `<div class="card"><b>نتيجة المقارنة</b><table style="width:100%;margin-top:6px">${rec.rows.map(x => `<tr><td>${LABELS[x.k]}</td><td>${fmt(x.local)}</td><td>${fmt(x.cloud)}</td><td class="${x.ok ? 'grn' : 'red'}">${x.ok ? '✔' : '✘'}</td></tr>`).join('')}</table>
        <div class="mu" style="margin-top:6px">الأرصدة: قارنت ${fmt(rec.compared)} عميل • الفروق: <b class="${rec.mm.length ? 'red' : 'grn'}">${rec.mm.length}</b> • ناقص في السحابة: <b class="${rec.miss.length ? 'red' : 'grn'}">${rec.miss.length}</b></div>
        ${rec.mm.slice(0, 10).map(x => `<div class="red">• ${esc(x.name)}: المتوقع ${x.expected} والموجود ${x.actual}</div>`).join('')}
        <div style="margin-top:8px"><b class="${rec.ok ? 'grn' : 'red'}">${rec.ok ? '✅ الجهاز والسحابة متطابقين 100%' : '❌ فيه فروق. دوس «مزامنة كاملة وتنظيف» وقارن تاني، ولو فضلت ابعتلي صورة الشاشة.'}</b></div>
        <div class="mu">${new Date(rec.at).toLocaleString('ar-EG')}</div></div>`;
    const loginCard = logged ? '' : `<div class="card"><b>تسجيل الدخول</b>
      <input type="email" dir="ltr" autocomplete="username" placeholder="الإيميل" value="${esc(CL.loginEm)}" oninput="CL.loginEm=this.value">
      <input type="password" dir="ltr" autocomplete="current-password" placeholder="الباسورد" oninput="CL.loginPw=this.value">
      <button class="btn" onclick="CL.login()">دخول</button>
      <div class="mu">الباسورد مبيتحفظش على الجهاز، بنحفظ بس مفتاح جلسة.</div></div>`;
    const acts = !logged ? '' : `<div class="card">
      <button class="btn" onclick="CL.toggle()">${on ? '⏸ وقّف المزامنة' : '▶️ شغّل المزامنة'}</button>
      <button class="btn t" onclick="CL.syncNow()">🔄 زامن دلوقتي</button>
      <button class="btn t" onclick="CL.compare()">🔍 قارن الأرقام (الجهاز والسحابة)</button>
      <button class="btn t" onclick="CL.full()">🧹 مزامنة كاملة وتنظيف</button>
      <button class="btn t" onclick="CL.logout()">🚪 تسجيل خروج</button></div>`;
    return back("go('more')") + `<h2>☁️ السحابة (Supabase)</h2><div class="sub">كل تعديل بيتسجّل على الجهاز وبيتنسخ للسحابة. الجهاز هو الأساس، والسحابة نسخة مطابقة.</div>
      <div class="card"><b>الحالة</b><div style="margin:6px 0">${st}</div>
        <div class="mu">${logged ? 'الحساب: ' + esc(c.em || '') : 'سجّل دخول الأول'}${c.last ? ' • آخر مزامنة: ' + new Date(c.last).toLocaleString('ar-EG') : ''}${logged && on ? ' • مستني يتبعت: ' + pending() : ''}</div>
        ${CL.msg ? '<div class="mu">' + esc(CL.msg) + '</div>' : ''}</div>
      ${loginCard}${acts}${recHtml}
      <div class="card mu">لو حصلت أي مشكلة: دوس «وقّف المزامنة». التطبيق بيشتغل زي الأول 100% وبيانات الجهاز مش بتتأثر.</div>`;
  }

  // ---------------- hooks (all guarded: a bug here must never break the app) ----------------
  try {
    const _save = save;
    save = function () { const r = _save.apply(this, arguments); try { CL.touch(); } catch (_) {} return r; };

    const _mapView = mapView;
    mapView = function () { try { if (v && v.cloud) return cloudView(); } catch (er) { console.error('[cloud]', er); } return _mapView(); };

    const _moreView = moreView;
    moreView = function () {
      const h = _moreView();
      const tile = '<button class="tile" onclick="v={tab:\'map\',cloud:1};render()"><span class="ti">☁️</span>السحابة</button>';
      const i = h.lastIndexOf('</div>');   // end of the tiles grid (the last closing div)
      return i > -1 ? h.slice(0, i) + tile + h.slice(i) : h + '<div class="grid2">' + tile + '</div>';
    };

    window.addEventListener('online', () => { if (FLAGS.dualWrite) schedule(1000); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && FLAGS.dualWrite) schedule(1500); });
    if (FLAGS.dualWrite && cfg().rt) schedule(2500);   // catch up with anything changed while the app was closed
    console.log('☁️ cloud.js ready. dualWrite =', FLAGS.dualWrite);
  } catch (er) { console.error('[cloud.js] failed to attach, app continues unchanged:', er); }
})();
