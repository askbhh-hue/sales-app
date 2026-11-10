/* =====================================================================
   route.js  -  Phase 6: visit-order engine that follows the rep's real working style:
     "village by village, nearest first, until the whole markaz is done; then the nearest next markaz".
   - Works fully on the device (offline, no server), using the app's own data (customers, visits, village cache S.vc).
   - Plugs into the app's existing tour functions (aiTour / tourStops), so the home card, the assistant and the
     map tour all use it. Switch: FLAGS.smartRoute (default ON in this file; turn off on the screen).
   - Distances are straight-line x 1.3 (a typical road factor). They are estimates, not turn-by-turn routing.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__rteLoaded) return;
  window.__rteLoaded = true;
  const ROAD = 1.3;
  const E = window.RTE = { cur: null, msg: '' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cfg = () => Object.assign({ cap: 12, round: true, mz: '', cent: null, start: 'home' }, S.rte || {});
  const patch = o => { S.rte = Object.assign({}, S.rte || {}, o); try { save(); } catch (_) {} };
  const fuel = () => Object.assign({ kmpl: 50, price: 25 }, S.rtFuel || {});
  const on = E.on = () => { try { return FLAGS.smartRoute !== false && !(S.rte && S.rte.off); } catch (_) { return true; } };
  const num = x => { const n = Number(x); return Number.isFinite(n) ? n : null; };
  const okLL = p => p && num(p.lat) !== null && num(p.lng) !== null && p.lat !== '' && p.lng !== '';
  const d = (a, b) => hav({ lat: +a.lat, lng: +a.lng }, { lat: +b.lat, lng: +b.lng });

  // ---- data helpers (same definitions as the app: a visit or a non-cancelled order counts) ----
  function lastMap() {
    const lv = {};
    S.visits.forEach(x => { lv[x.cid] = Math.max(lv[x.cid] || 0, x.t); });
    S.orders.forEach(o => { if (!o.cx) lv[o.cid] = Math.max(lv[o.cid] || 0, o.t); });
    return lv;
  }
  const pendingOf = (cs, lv) => cs.filter(c => { const l = lv[c.id] || 0; return !l || (Date.now() - l) / 864e5 > (S.cyc || 14); });
  function pendingGroups() {
    const lv = lastMap();
    return groups().filter(x => x.cs.length && x.mz !== 'بدون مركز').map(x => { x.pn = pendingOf(x.cs, lv); x.ll = gll(x); return x; }).filter(x => x.pn.length);
  }
  function centroid(gs) {
    const p = gs.map(x => x.ll).filter(okLL);
    return p.length ? { lat: p.reduce((a, b) => a + +b.lat, 0) / p.length, lng: p.reduce((a, b) => a + +b.lng, 0) / p.length } : null;
  }
  E.start = () => { const c = cfg(); if (c.start === 'gps' && E.cur && Date.now() - E.cur.t < 6 * 36e5) return E.cur; return homeLL(); };

  // ---- which markaz? stay in it until every village is done, then the nearest one ----
  function pickMarkaz(byMz, skip) {
    const c = cfg(), names = Object.keys(byMz).filter(m => !(skip || []).includes(m));
    if (!names.length) return { mz: '', switched: false };
    if (c.mz && names.includes(c.mz)) return { mz: c.mz, switched: false };
    const anchor = (c.mz ? c.cent : null) || E.start();               // where the finished markaz was, else where I start from
    const cents = {}; names.forEach(m => { cents[m] = centroid(byMz[m]); });
    let best = '', bd = Infinity;
    if (okLL(anchor)) names.forEach(m => { if (cents[m]) { const k = d(anchor, cents[m]); if (k < bd) { bd = k; best = m; } } });
    if (!best) best = names.sort((a, b) => byMz[b].reduce((s, x) => s + x.pn.length, 0) - byMz[a].reduce((s, x) => s + x.pn.length, 0))[0];
    return { mz: best, switched: true, cent: cents[best] };
  }


  // ---- ordering variants for the chosen villages (the day's route options) ----
  const COL = { opt: '#1f7a4d', nn: '#e67e22', far: '#8e44ad', dense: '#2471a3', farc: '#c0392b' };
  function pathKm(arr, st, round) {
    let k = 0, p = okLL(st) ? st : null;
    arr.forEach(x => { if (!okLL(x.ll)) return; if (p) k += d(p, x.ll); p = x.ll; });
    if (round && okLL(st) && p && p !== st) k += d(p, st);
    return k;
  }
  function perms(a, fn) {                                  // Heap's algorithm (used only for <= 8 villages)
    const n = a.length, c = new Array(n).fill(0), A = a.slice(); fn(A);
    let i = 0;
    while (i < n) { if (c[i] < i) { const j = i % 2 ? c[i] : 0; const t = A[j]; A[j] = A[i]; A[i] = t; fn(A); c[i]++; i = 0; } else { c[i] = 0; i++; } }
  }
  function bestOrder(loc, st, round) {
    let best = loc.slice(), bk = pathKm(loc, st, round);
    if (loc.length > 1 && loc.length <= 8) perms(loc, A => { const k = pathKm(A, st, round); if (k < bk - 1e-9) { bk = k; best = A.slice(); } });
    return best;
  }
  // take whole villages (in the given order) until the day's customer target is reached
  function takeUntil(ordered, cap) { const list = []; let n = 0; for (const x of ordered) { if (list.length && (n >= cap || list.length >= 8)) break; list.push(x); n += x.pn.length; } return list; }
  // other village sets in the same markaz: a cluster around the biggest village, and a cluster around the farthest one
  function setAlts(gs, st, c, baseList) {
    const loc = gs.filter(x => okLL(x.ll)), out = [], seen = new Set([baseList.filter(x => okLL(x.ll)).map(x => x.key).sort().join('|')]);
    if (loc.length < 2) return out;
    const mk = (id, label, seed) => {
      const set = takeUntil(loc.slice().sort((a, b) => d(seed.ll, a.ll) - d(seed.ll, b.ll)), c.cap), key = set.map(x => x.key).sort().join('|');
      if (seen.has(key)) return; seen.add(key);
      const ord = bestOrder(set, st, c.round);
      out.push({ id, ids: [id], key, names: [label], order: ord, km: Math.round(pathKm(ord, st, c.round) * ROAD * 10) / 10, col: COL[id] });
    };
    const big = loc.slice().sort((a, b) => b.pn.length - a.pn.length)[0];
    mk('dense', 'تجمّع حوالين ' + gname(big), big);
    if (okLL(st)) mk('farc', 'ابدأ بالأبعد: ' + gname(loc.slice().sort((a, b) => d(st, b.ll) - d(st, a.ll))[0]), loc.slice().sort((a, b) => d(st, b.ll) - d(st, a.ll))[0]);
    return out;
  }
  function variants(list, st, round) {
    const loc = list.filter(x => okLL(x.ll)), noloc = list.filter(x => !okLL(x.ll)), out = [];
    const add = (id, name, arr) => {
      const key = arr.map(x => x.key).join('|'), ex = out.find(o => o.key === key);
      if (ex) { ex.ids.push(id); ex.names.push(name); return; }
      const full = arr.concat(noloc), kmv = Math.round(pathKm(full, st, round) * ROAD * 10) / 10, same = out.find(o => Math.abs(o.km - kmv) < 0.05 && o.order.length === full.length && o.order.every(x => full.includes(x)));
      if (same) { same.ids.push(id); same.names.push(name); return; }      // same villages, same distance (e.g. reverse direction) = not a real alternative
      out.push({ id, ids: [id], key, names: [name], order: full, km: Math.round(pathKm(full, st, round) * ROAD * 10) / 10, col: COL[id] });
    };
    add('opt', 'الأفضل: أقصر مشوار', bestOrder(loc, st, round));
    add('nn', 'الأقرب فالأقرب', loc);
    if (okLL(st) && loc.length > 1) add('far', 'الأبعد الأول', loc.slice().sort((a, b) => d(st, b.ll) - d(st, a.ll)));
    return out;
  }

  // ---- the plan ----
  E.plan = function (opt) {
    opt = opt || {};
    const all = pendingGroups(), byMz = {};
    all.forEach(x => (byMz[x.mz] = byMz[x.mz] || []).push(x));
    const pk = pickMarkaz(byMz, opt.skip);
    if (!pk.mz) return { mz: '', list: [], n: 0, km: 0, cost: 0, left: 0, vTotal: 0, vDone: 0, unk: 0, byMz };
    if (pk.switched && !opt.dry && !(opt.skip && opt.skip.length)) patch({ mz: pk.mz, cent: pk.cent || null });
    const c = cfg(), gs = byMz[pk.mz], st = E.start();
    // order villages: nearest-neighbour from the start point; villages with no coordinates go last (biggest first)
    const withLL = gs.filter(x => okLL(x.ll)), noLL = gs.filter(x => !okLL(x.ll)).sort((a, b) => b.pn.length - a.pn.length);
    const ordered = []; let cur = okLL(st) ? st : null; const rest = withLL.slice();
    if (!cur && rest.length) { const ce = centroid(rest); rest.sort((a, b) => d(ce, a.ll) - d(ce, b.ll)); cur = rest[0].ll; }
    while (rest.length) {
      let bi = 0, bd = Infinity;
      rest.forEach((x, i) => { const k = d(cur, x.ll); if (k < bd) { bd = k; bi = i; } });
      const x = rest.splice(bi, 1)[0]; x.hop = okLL(cur) ? d(cur, x.ll) : 0; ordered.push(x); cur = x.ll;
    }
    noLL.forEach(x => { x.hop = 0; ordered.push(x); });
    // take villages until today's customer target is reached (whole villages only)
    const list = takeUntil(ordered, c.cap);
    // route options: the same villages in different orders, plus other village sets in this markaz; the user's pick (for today) or the shortest is active
    const alts = variants(list, st, c.round).concat(setAlts(gs, st, c, list));
    alts.forEach(a => { a.n = a.order.reduce((s2, x) => s2 + x.pn.length, 0); a.nv = a.order.length; });
    const pk2 = c.pick && c.pick.d === day0() ? c.pick.id : '';
    const active = alts.find(a => a.ids.includes(pk2)) || alts[0];
    const ordList = active ? active.order : list, n = active ? active.n : 0;
    // nearest other markaz (one tap switches to it)
    const others = Object.keys(byMz).filter(m => m !== pk.mz).map(m => { const ce = centroid(byMz[m]), ref = centroid(gs) || st; return { mz: m, dist: okLL(ce) && okLL(ref) ? d(ref, ce) : Infinity }; }).sort((a, b) => a.dist - b.dist).slice(0, 2).map(o => {
      const gs2 = byMz[o.mz].filter(x => okLL(x.ll)); if (!gs2.length) return { mz: o.mz, n: 0, nv: 0, km: null };
      const o2 = gs2.slice().sort((a, b) => d(st || gs2[0].ll, a.ll) - d(st || gs2[0].ll, b.ll)), l2 = takeUntil(o2, c.cap), ord = bestOrder(l2, st, c.round);
      return { mz: o.mz, n: ord.reduce((s2, x) => s2 + x.pn.length, 0), nv: ord.length, km: Math.round(pathKm(ord, st, c.round) * ROAD * 10) / 10 };
    });
    let unk = 0; ordList.forEach(x => { if (!okLL(x.ll)) unk++; });
    let km = active ? active.km : 0;
    { let q = okLL(st) ? st : null; ordList.forEach(x => { x.hop = 0; if (okLL(x.ll)) { if (q) x.hop = d(q, x.ll); q = x.ll; } }); }
    const f = fuel(), cost = Math.round(km / f.kmpl * f.price);
    const vAll = groups().filter(x => x.cs.length && x.mz === pk.mz).length;
    return { mz: pk.mz, list: ordList, alts, others, active: active ? active.id : '', n, km, cost, unk, left: gs.reduce((s, x) => s + x.pn.length, 0), vTotal: vAll, vDone: vAll - gs.length, start: st, byMz, alt: !!(opt.skip && opt.skip.length) };
  };

  // ---- plug into the app's existing tour functions ----
  function attach() {
    const _aiTour = aiTour;
    aiTour = function () {
      const b = _aiTour.apply(this, arguments);
      if (b && b.pinned) return b;                               // a tour the assistant pinned stays as is
      if (!on()) return b;
      const sk = (typeof axSk === 'function') ? axSk() : [];
      const p = E.plan({ skip: sk });
      return { mz: p.mz, list: p.list, alt: p.alt, smart: p };
    };
    const _ts = tourStops;
    tourStops = function (list) {
      if (!on() || !list.length || !list.every(x => x && x.pn)) return _ts.apply(this, arguments);
      const out = []; let cur = E.start();
      for (const x of list) {
        const withLL = x.pn.filter(c => okLL(c)), noLL = x.pn.filter(c => !okLL(c)), rest = withLL.slice();
        while (rest.length) {
          let bi = 0, bd = Infinity;
          rest.forEach((q, i) => { const k = okLL(cur) ? d(cur, q) : 0; if (k < bd) { bd = k; bi = i; } });
          cur = rest.splice(bi, 1)[0]; out.push(cur);
        }
        if (noLL.length) {                                       // customers with no pin: one stop at the village centre
          if (okLL(x.ll) && !withLL.length) { const s = Object.assign({}, noLL[0], { lat: +x.ll.lat, lng: +x.ll.lng, vlg: 1 }); out.push(s); cur = s; }
          else if (!okLL(x.ll)) noLL.forEach(q => out.push(q));
        }
      }
      return out;
    };
  }

  // ---- screen ----
  const dstr = k => (k === null || k === undefined || !isFinite(k)) ? '—' : k.toLocaleString('ar-EG') + ' كم';
  E.setCap = dv => { patch({ cap: Math.max(3, Math.min(40, cfg().cap + dv)) }); render(); };
  E.toggleRound = () => { patch({ round: !cfg().round }); render(); };
  E.setMz = m => { patch({ mz: m, cent: null }); render(); };
  E.setFuel = (k, val) => { const n = num(val); if (n && n > 0) { S.rtFuel = Object.assign({}, S.rtFuel || {}, { [k]: n }); try { save(); } catch (_) {} } render(); };
  E.toggleOn = () => { patch({ off: on() }); render(); };
  E.done = id => { checkin(id); render(); };
  E.useGps = function () {
    if (!navigator.geolocation) { E.msg = 'الجهاز مش بيدعم تحديد الموقع'; return render(); }
    E.msg = '⏳ بحدد موقعك…'; render();
    navigator.geolocation.getCurrentPosition(p => { E.cur = { lat: p.coords.latitude, lng: p.coords.longitude, t: Date.now() }; patch({ start: 'gps' }); E.msg = '✔ اتحدد موقعك'; render(); },
      () => { E.msg = '✘ مقدرتش أحدد موقعك، اتأكد إن الموقع مسموح للتطبيق'; render(); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  };
  E.useHome = () => { patch({ start: 'home' }); E.msg = ''; render(); };

  // ---- map: numbered villages, best route + alternatives, real-road line when the free routing service answers ----
  E.pickAlt = id => { patch({ pick: { d: day0(), id } }); render(); };
  const roadCache = {};
  async function road(pts) {                                // OSRM public demo server (free, no key). Optional: falls back to straight lines.
    const key = pts.map(p => (+p.lat).toFixed(4) + ',' + (+p.lng).toFixed(4)).join(';');
    if (roadCache[key]) return roadCache[key];
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 12000);
    try {
      const r = await fetch('https://router.project-osrm.org/route/v1/driving/' + pts.map(p => (+p.lng).toFixed(5) + ',' + (+p.lat).toFixed(5)).join(';') + '?overview=full&geometries=geojson', { signal: ac.signal });
      const j = await r.json();
      if (j && j.code === 'Ok' && j.routes && j.routes[0]) {
        const o = j.routes[0];
        return (roadCache[key] = { km: o.distance / 1000, min: o.duration / 60, line: o.geometry.coordinates.map(q => [q[1], q[0]]) });
      }
    } catch (_) { /* offline or service busy: keep the straight line */ } finally { clearTimeout(tm); }
    return null;
  }
  const vhref = x => okLL(x.ll) ? 'https://www.google.com/maps/dir/?api=1&destination=' + (+x.ll.lat) + ',' + (+x.ll.lng) + '&travelmode=driving' : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([x.vl, x.mz, 'بني سويف مصر'].filter(Boolean).join(' '));
  const bearing = (a, b) => { const r = x => x * Math.PI / 180, y = Math.sin(r(b.lng - a.lng)) * Math.cos(r(b.lat)), x = Math.cos(r(a.lat)) * Math.sin(r(b.lat)) - Math.sin(r(a.lat)) * Math.cos(r(b.lat)) * Math.cos(r(b.lng - a.lng)); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; };
  function css() {
    if (document.getElementById('rtecss')) return;
    const st = document.createElement('style'); st.id = 'rtecss';
    st.textContent = '#rtemap{height:58vh;min-height:330px;border-radius:20px;overflow:hidden;z-index:0;isolation:isolate;margin:8px 0;background:var(--surf2)}' +
      '.rtl{position:absolute;top:31px;left:50%;transform:translateX(-50%);white-space:nowrap;font:700 11px Cairo,sans-serif;background:rgba(255,255,255,.92);color:#1b2820;padding:1px 6px;border-radius:7px;box-shadow:0 1px 4px rgba(0,0,0,.35)}' +
      '.rtd{width:9px;height:9px;border-radius:50%;background:#fff;border:2px solid #555}' +
      '.rtc{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.rtc .chip{border-width:2px;border-style:solid}';
    document.head.appendChild(st);
  }
  let drawTok = 0;
  E.draw = async function () {
    const el = document.getElementById('rtemap'); if (!el) return;
    const tok = ++drawTok, p = E.plan({ dry: true }); if (!p.list.length) return;
    css();
    try { await loadLeaflet(); } catch (_) { el.outerHTML = '<div class="card mu">الخريطة الحية محتاجة إنترنت. القايمة تحت شغّالة عادي.</div>'; return; }
    if (tok !== drawTok || !document.getElementById('rtemap')) return;
    const el2 = document.getElementById('rtemap');
    if (LM) { try { LM.remove(); } catch (_) {} LM = null; }
    LM = L.map(el2).setView([29.07, 31.1], 10);
    (typeof axTiles === 'function' ? axTiles() : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' })).addTo(LM);
    const st = p.start, bounds = [], act = p.alts.find(a => a.id === p.active || a.ids.includes(p.active)) || p.alts[0], colA = act.col;
    const ptsOf = order => { const a = []; if (okLL(st)) a.push({ lat: +st.lat, lng: +st.lng }); order.filter(x => okLL(x.ll)).forEach(x => a.push({ lat: +x.ll.lat, lng: +x.ll.lng })); if (c0().round && okLL(st) && a.length > 1) a.push({ lat: +st.lat, lng: +st.lng }); return a; };
    const c0 = cfg;
    // alternatives first (thin, dashed), the active one on top (thick)
    p.alts.filter(a => a !== act).forEach(a => { const pts = ptsOf(a.order); if (pts.length > 1) L.polyline(pts.map(q => [q.lat, q.lng]), { color: a.col, weight: 3, opacity: .85, dashArray: '8 8' }).addTo(LM).bindPopup('<b>' + esc(a.names[0]) + '</b><br>' + a.km + ' كم تقريباً'); });
    const ap = ptsOf(act.order);
    let straight = null;
    if (ap.length > 1) {
      straight = L.polyline(ap.map(q => [q.lat, q.lng]), { color: colA, weight: 6, opacity: .95, dashArray: '2 10', lineCap: 'round' }).addTo(LM);
      for (let i = 0; i < ap.length - 1; i++) {                   // direction arrows in the middle of each leg
        const a = ap[i], b = ap[i + 1], mid = [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2];
        L.marker(mid, { interactive: false, icon: L.divIcon({ className: '', html: '<span style="display:block;transform:rotate(' + bearing(a, b).toFixed(0) + 'deg);color:' + colA + ';font-size:17px;text-shadow:0 0 3px #fff,0 0 3px #fff;line-height:17px">▲</span>', iconSize: [17, 17], iconAnchor: [8, 8] }) }).addTo(LM);
      }
    }
    if (okLL(st)) { L.marker([+st.lat, +st.lng], { icon: L.divIcon({ className: '', html: '<span class="mk hm">' + (cfg().start === 'gps' ? '📍' : '🏠') + '</span>', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(LM).bindPopup('نقطة البداية'); bounds.push([+st.lat, +st.lng]); }
    act.order.forEach((x, i) => {
      if (!okLL(x.ll)) return;
      const ll = [+x.ll.lat, +x.ll.lng]; bounds.push(ll);
      x.cs.filter(okLL).forEach(q => L.marker([+q.lat, +q.lng], { interactive: false, icon: L.divIcon({ className: '', html: '<div class="rtd"></div>', iconSize: [9, 9], iconAnchor: [4, 4] }) }).addTo(LM));
      L.marker(ll, { zIndexOffset: 500, icon: L.divIcon({ className: '', html: '<div style="position:relative"><span class="mk" style="background:' + colA + '">' + (i + 1) + '</span><span class="rtl">' + esc(gname(x)) + ' • ' + x.pn.length + '</span></div>', iconSize: [28, 28], iconAnchor: [14, 14] }) })
        .addTo(LM).bindPopup('<b>' + esc(gname(x)) + '</b><br>' + x.pn.length + ' عميل محتاج زيارة' + (x.hop ? '<br>' + (Math.round(x.hop * ROAD * 10) / 10) + ' كم من اللي قبلها' : '') + '<br><a class="pp" target="_blank" rel="noopener" href="' + esc(vhref(x)) + '">🧭 جوجل مابس</a>');
    });
    if (bounds.length) LM.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    // real roads for the ACTIVE route only (one request); replaces the dashed straight line when it arrives
    const info = document.getElementById('rteinfo');
    if (ap.length > 1) {
      const rd = await road(ap);
      if (tok !== drawTok) return;
      if (rd) {
        if (straight) LM.removeLayer(straight);
        L.polyline(rd.line, { color: colA, weight: 6, opacity: .9 }).addTo(LM);
        const f = fuel(), cost = Math.round(rd.km / f.kmpl * f.price), hh = Math.floor(rd.min / 60), mm = Math.round(rd.min % 60);
        if (info) info.innerHTML = '🛣 على الطرق الفعلية: <b>' + (Math.round(rd.km * 10) / 10).toLocaleString('ar-EG') + ' كم</b> • قيادة حوالي ' + (hh ? hh + ' ساعة و ' : '') + mm + ' دقيقة • بنزين حوالي ' + cost.toLocaleString('ar-EG') + ' جنيه';
      } else if (info) info.innerHTML = 'الخط المنقّط مسار تقريبي (خط مستقيم). الطرق الفعلية بتظهر لما يكون فيه نت.';
    }
  };

  function view() {
    const c = cfg(), p = E.plan({ dry: false }), st = E.start(), f = fuel();
    const mzOpts = Object.keys(p.byMz || {}).map(m => `<option value="${esc(m)}"${m === p.mz ? ' selected' : ''}>${esc(m)} (${p.byMz[m].reduce((s, x) => s + x.pn.length, 0)} عميل)</option>`).join('');
    const head = back("go('more')") + '<h2>🧭 جولة النهارده</h2><div class="sub">قرية قرية، الأقرب الأول، لحد ما تخلّص المركز كله.</div>';
    if (!p.mz) return head + '<div class="card" style="text-align:center"><div style="font-size:30px">🎉</div><b>مفيش عملاء محتاجين زيارة دلوقتي</b><div class="mu">كل عملائك اتزاروا في آخر ' + (S.cyc || 14) + ' يوم.</div></div>' + settings(c, f, mzOpts, p, st);
    const pct = p.vTotal ? Math.round(p.vDone / p.vTotal * 100) : 0;
    const stops = tourStops(p.list), href = (() => { try { const u = gmUrls(stops); return u; } catch (_) { return []; } })();
    return head + `<div class="card"><div class="mu">المركز الحالي</div><div class="hn" style="font-size:22px;margin:4px 0">${esc(p.mz)}</div>
      <div class="mu">خلّصت ${p.vDone} من ${p.vTotal} قرية • فاضل ${p.left} عميل</div>
      <div style="height:8px;border-radius:6px;background:rgba(127,127,127,.25);margin:8px 0"><div style="height:8px;border-radius:6px;background:var(--pr,#3ddc97);width:${pct}%"></div></div>
      <div class="mu">النهارده: ${p.list.length} قرية • ${p.n} عميل • مشوار تقريبي ${dstr(p.km)}${c.round ? ' (رايح جاي)' : ''} • بنزين حوالي ${p.cost.toLocaleString('ar-EG')} جنيه${p.unk ? ' • ' + p.unk + ' قرية من غير موقع' : ''}</div></div>
      ${mapBlock(p)}
      ${p.list.map((x, i) => `<div class="card"><b>${i + 1}. ${esc(gname(x))}</b> <span class="mu">• ${x.pn.length} عميل${okLL(x.ll) ? (x.hop ? ' • ' + dstr(Math.round(x.hop * ROAD * 10) / 10) + ' من اللي قبلها' : '') : ' • مفيش موقع للقرية'}</span>
        ${x.pn.slice(0, 15).map(q => `<div class="item"><button class="itm-main" onclick="open_('${esc(q.id)}')"><span class="grow"><span class="nm">${esc(q.name)}</span><span class="sb">${esc([q.shop, q.phone].filter(Boolean).join(' • ') || '—')}${bal(q.id) > 0 ? ' • عليه ' + Math.round(bal(q.id)) : ''}</span></span></button>${q.phone ? `<a class="icobtn" href="tel:${esc(q.phone)}">📞</a>` : ''}<button class="icobtn" aria-label="تمت الزيارة" onclick="RTE.done('${esc(q.id)}')">✓</button></div>`).join('')}
        ${x.pn.length > 15 ? '<div class="mu">+ ' + (x.pn.length - 15) + ' عميل تانيين</div>' : ''}</div>`).join('')}
      ${href.map((u, i) => `<a class="btn" target="_blank" rel="noopener" href="${esc(u)}">🧭 ${href.length > 1 ? 'الجزء ' + (i + 1) + ' من ' + href.length + ' • ' : ''}افتح على جوجل مابس</a>`).join('')}
      ${settings(c, f, mzOpts, p, st)}`;
  }
  // ---- find places for villages that have none (free OpenStreetMap search, cached in S.vc, 1 request/second) ----
  const noLoc = mz => ((E.plan({ dry: true }).byMz || {})[mz] || []).filter(x => !okLL(x.ll) && x.vl);
  E.locate = async function () {
    if (typeof geoBusy !== 'undefined' && geoBusy) return toast('فيه بحث شغال دلوقتي، استنى');
    const p = E.plan({ dry: true }), todo = noLoc(p.mz);
    if (!todo.length) return toast('كل قرى المركز ليها مواقع');
    if (!confirm('هدوّر على مواقع ' + todo.length + ' قرية بالإنترنت (حوالي ' + Math.ceil(todo.length * 1.3) + ' ثانية). المواقع بتتحفظ ومش هتتكرر. تكمّل؟')) return;
    geoBusy = true; S.vc = S.vc || {};
    let ok = 0, fail = 0; const bad = [];
    try {
      for (let i = 0; i < todo.length; i++) {
        const x = todo[i], k = nk(x.mz === 'بدون مركز' ? '' : x.mz) + '|' + nk(x.vl);
        toast('بدوّر ' + (i + 1) + ' من ' + todo.length + ': ' + x.vl);
        const r = await geoVillage(x.vl, x.mz);
        if (r === undefined) fail++;                                  // network problem: do not cache a "miss"
        else { S.vc[k] = r || { miss: Date.now() }; save(); if (r) ok++; else bad.push(x.vl); }
        await new Promise(res => setTimeout(res, 1100));
      }
    } finally { geoBusy = false; render(); }
    toast('اتحدد موقع ' + ok + ' قرية' + (fail ? ' • فشل الاتصال في ' + fail + ' (جرّب تاني)' : '') + (bad.length ? ' • مالقيتش ' + bad.length : ''));
    if (bad.length) alert('مالقيتش مكان للقرى دي:\n' + bad.join('\n') + '\n\nسجّل موقع أي عميل منها من صفحة العميل وهتتحدد القرية.');
  };

  function mapBlock(p) {
    const hasLL = p.list.some(x => okLL(x.ll)), nl = noLoc(p.mz).length;
    const locBtn = nl ? `<div class="card"><b>📍 ${nl} قرية في ${esc(p.mz)} من غير موقع</b><div class="mu" style="margin:6px 0">من غير موقع القرية الخطة مش بتحسب مسافتها صح. دوس وهدوّر عليها مجاناً من خرايط OpenStreetMap.</div><button class="btn t sm" onclick="RTE.locate()">🔎 حدّد مواقع القرى الناقصة</button></div>` : '';
    if (!hasLL) return locBtn + '<div class="card mu">مفيش مواقع للقرى دي على الخريطة لسه. افتح <b>الخريطة</b> من المزيد وسجّل مواقع العملاء، أو سيب التطبيق يحدّد مواقع القرى لوحده.</div>';
    const fu = fuel(), money = k => Math.round(k / fu.kmpl * fu.price).toLocaleString('ar-EG');
    const chips = p.alts.map(a => `<button class="chip${(a.id === p.active || a.ids.includes(p.active)) ? ' on' : ''}" style="border-color:${a.col}" onclick="RTE.pickAlt('${a.id}')"><span style="color:${a.col}">●</span> ${esc(a.names.join(' = '))} • ${a.nv} قرى • ${a.n} عميل • ${a.km.toLocaleString('ar-EG')} كم • ${money(a.km)} جنيه</button>`).join('');
    const oth = (p.others || []).filter(o => o.nv).map(o => `<button class="chip" style="border-color:#7f8c8d" onclick="if(confirm('تغيّر المركز لـ ${esc(o.mz)}؟ هيفضل ثابت لحد ما تخلّصه.'))RTE.setMz('${esc(o.mz)}')">🔀 مركز ${esc(o.mz)} • ${o.nv} قرى • ${o.n} عميل${o.km != null ? ' • ' + o.km.toLocaleString('ar-EG') + ' كم' : ''}</button>`).join('');
    return `${locBtn}<div class="rtc">${chips}</div>${oth ? '<div class="mu">أو غيّر المركز (بيغيّر خطتك فعلاً):</div><div class="rtc">' + oth + '</div>' : ''}<div id="rtemap"></div>
      <button class="btn t sm" onclick="locateMe()">📍 موقعي على الخريطة</button>
      <div class="mu" id="rteinfo" style="margin:6px 0">⏳ بجيب المسار على الطرق…</div>
      <div class="mu">الخط السميك هو المسار المختار (الأرقام ترتيب القرى والأسهم اتجاه الحركة). الخطوط المنقّطة الرفيعة بدايل، دوس على أي اختيار فوق عشان تعتمده.</div>`;
  }

  function settings(c, f, mzOpts, p, st) {
    return `<div class="card"><b>الإعدادات</b>
      <div class="mu" style="margin:6px 0">نقطة البداية: ${c.start === 'gps' && E.cur ? 'موقعي الحالي' : (S.home ? esc(S.home.n || 'البيت') : '<span class="red">مش محدد (حدّد موقع البيت في الإعدادات)</span>')}</div>
      <button class="btn t sm" onclick="RTE.useGps()">📍 ابدأ من موقعي دلوقتي</button> <button class="btn t sm" onclick="RTE.useHome()">🏠 ابدأ من البيت</button>
      ${E.msg ? '<div class="mu">' + esc(E.msg) + '</div>' : ''}
      <div style="margin:10px 0">عدد العملاء في اليوم: <button class="chip" onclick="RTE.setCap(-1)">−</button> <b>${c.cap}</b> <button class="chip" onclick="RTE.setCap(1)">+</button></div>
      ${mzOpts ? `<div class="msgf"><label class="lb">غيّر المركز (هيفضل ثابت لحد ما تخلّصه)</label><select onchange="RTE.setMz(this.value)">${mzOpts}</select></div>` : ''}
      <label style="display:flex;gap:10px;align-items:center;margin:10px 0"><input type="checkbox" ${c.round ? 'checked' : ''} onchange="RTE.toggleRound()" style="width:22px;height:22px;margin:0"> احسب الرجوع للبداية</label>
      <div class="msgf"><label class="lb">كم للتر</label><input type="number" inputmode="decimal" value="${f.kmpl}" onchange="RTE.setFuel('kmpl',this.value)"></div>
      <div class="msgf"><label class="lb">سعر اللتر (جنيه)</label><input type="number" inputmode="decimal" value="${f.price}" onchange="RTE.setFuel('price',this.value)"></div>
      <div class="mu">المسافات تقديرية: خط مستقيم × 1.3 تقريباً بدل الطرق الفعلية.</div>
      <button class="btn t" style="margin-top:8px" onclick="RTE.toggleOn()">${on() ? '⏸ وقّف الترتيب الذكي (ارجع للطريقة القديمة)' : '▶️ شغّل الترتيب الذكي'}</button></div>`;
  }
  E.view = view;

  try {
    attach();
    const _mv = mapView;
    mapView = function () { try { if (v && v.rte) return view(); } catch (er) { console.error('[rte]', er); return back("go('more')") + '<div class="card red">حصلت مشكلة في شاشة الجولة، ارجع للمزيد.</div>'; } return _mv(); };
    const _more = moreView;
    moreView = function () {
      const h = _more();
      const tile = '<button class="tile" onclick="v={tab:\'map\',rte:1};render()"><span class="ti">🧭</span>جولة النهارده</button>';
      const i = h.lastIndexOf('</div>');
      return i > -1 ? h.slice(0, i) + tile + h.slice(i) : h + '<div class="grid2">' + tile + '</div>';
    };
    const _pol = polish; polish = function () { _pol(); if (document.getElementById('rtemap')) E.draw(); };
    console.log('🧭 route.js ready');
  } catch (er) { console.error('[route.js] failed to attach, app continues unchanged:', er); }
})();
