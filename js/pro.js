/* =====================================================================
   pro.js  -  Field Sales App Enhancements:
   - CSS & mobile RTL overflow / z-index / dark-mode contrast fixes
   - Theme toggle (Auto / Light / Dark) in Settings + backup sync
   - Masked PIN setup modal + improved lock screen + Escape close
   - bootReady save queue & Blob URL leak cleanup
   - Anthropic valid model ID fix (claude-haiku-4-5)
   - Global Quick Search (🔍) & normalized Arabic multi-word search
   - Order 1-tap Cash/Credit, credit-limit warning & float stock r2()
   - Payment note in collection sheet, duplicate phone warning, 0-price allowed
   - Excel/CSV export (UTF-8 BOM) for Debts & Period Sales Reports
   ===================================================================== */
(function () {
  'use strict';
  if (window.__proLoaded) return;
  window.__proLoaded = true;

  var doc = document;
  var esc = function (s) {
    return typeof e === 'function' ? e(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var jsEsc = function (s) {
    return typeof js === 'function' ? js(s) : esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]+/g, ' '));
  };
  var norm = function (s) {
    if (typeof anorm === 'function') return anorm(s);
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[\u064B-\u0652\u0640]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
      .trim();
  };

  // ---------------- 1. CSS Fixes & Mobile Polish ----------------
  function injectCss() {
    if (doc.getElementById('procss')) return;
    var st = doc.createElement('style');
    st.id = 'procss';
    st.textContent =
      ':root{--card:var(--surf);--redt:#fffdf8}' +
      '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--redt:#1d0907}}' +
      ':root[data-theme="dark"]{--redt:#1d0907}' +
      'html,body{overflow-x:hidden;max-width:100%}' +
      '.row{flex-wrap:wrap}.row>*,.item,.card,.grow{min-width:0}' +
      '#toast{z-index:90!important}' +
      '.keypad button{min-height:52px}' +
      '.lockwrap{max-width:380px;margin:36px auto;text-align:center}' +
      '.lockwrap .lockico{font-size:44px;margin-bottom:6px}' +
      '.qsearch-btn{flex:none;width:42px;height:42px;border-radius:12px;border:1px solid var(--line);background:var(--surf);color:var(--tx);font-size:18px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}' +
      '.credwarn{margin-top:8px;padding:10px 12px;border-radius:12px;background:var(--redl);color:var(--red);font-size:13px;font-weight:700}' +
      '.qs-sec{font-size:13px;font-weight:700;color:var(--mu);margin:10px 2px 6px}';
    doc.head.appendChild(st);
  }
  injectCss();

  if (window.FLAGS && !window.FS_FLAGS) window.FS_FLAGS = window.FLAGS;

  // ---------------- 2. Theme Manager (Auto / Light / Dark) ----------------
  function applyTheme() {
    if (typeof S === 'undefined' || !S) return;
    var t = S.theme === 'light' || S.theme === 'dark' ? S.theme : 'auto';
    var root = doc.documentElement;
    if (t === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);
    try {
      var dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var col = dark ? '#08110d' : '#f4efe4';
      doc.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
        if (!m.media || (dark && m.media.indexOf('dark') > -1) || (!dark && m.media.indexOf('light') > -1)) m.content = col;
      });
    } catch (_) {}
  }
  window.applyTheme = applyTheme;
  window.setTheme = function (t) {
    if (typeof S === 'undefined' || !S) return;
    S.theme = (t === 'light' || t === 'dark') ? t : 'auto';
    applyTheme();
    if (typeof save === 'function') save();
    if (typeof render === 'function') render();
  };
  applyTheme();

  // ---------------- 3. bootReady Save Queue & Object URL Leak Fixes ----------------
  if (typeof save === 'function') {
    var _save0 = save;
    window._savePend = false;
    save = function () {
      if (typeof bootReady !== 'undefined' && !bootReady) {
        window._savePend = true;
        return;
      }
      return _save0.apply(this, arguments);
    };
    if (typeof bootReady !== 'undefined' && !bootReady) {
      var _bt = setInterval(function () {
        if (bootReady) {
          clearInterval(_bt);
          if (window._savePend) {
            window._savePend = false;
            save();
          }
        }
      }, 150);
    }
  }

  dlBackup = function () {
    try {
      var b = new Blob([JSON.stringify(S)], { type: 'application/json' });
      var url = URL.createObjectURL(b);
      var a = doc.createElement('a');
      a.href = url;
      a.download = 'sales-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      doc.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) {} }, 2500);
      S.lb = Date.now();
      save();
      toast('تم تنزيل النسخة');
      render();
    } catch (_) {
      if (typeof backup === 'function') backup();
    }
  };

  if (typeof imgFallback === 'function') {
    imgFallback = function (keys) {
      keys.forEach(function (k) {
        var f = typeof IMGF !== 'undefined' && IMGF[k];
        if (!f) return;
        var url = URL.createObjectURL(f);
        var a = doc.createElement('a');
        a.href = url;
        a.download = f.name;
        doc.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) {} }, 4000);
      });
      toast('المتصفح مش بيدعم مشاركة الصور مباشرة، نزّلتها على جهازك وابعتها من واتساب');
    };
  }

  if (typeof applyBackup === 'function') {
    var _applyBackup0 = applyBackup;
    applyBackup = function () {
      var r = _applyBackup0.apply(this, arguments);
      applyTheme();
      return r;
    };
  }

  // ---------------- 4. Anthropic Model ID Fix (claude-haiku-4-5) ----------------
  function fixAnthropicModel() {
    var BAD = 'claude-haiku-5-5', GOOD = 'claude-haiku-4-5';
    try {
      if (typeof AXPRE !== 'undefined' && AXPRE.anthropic && AXPRE.anthropic.model === BAD) AXPRE.anthropic.model = GOOD;
      var cfgKey = typeof AXCK === 'string' ? AXCK : 'fs_ai_cfg';
      var rawCfg = localStorage.getItem(cfgKey);
      if (rawCfg && rawCfg.indexOf(BAD) > -1) {
        var c = JSON.parse(rawCfg);
        if (c && c.model === BAD) { c.model = GOOD; localStorage.setItem(cfgKey, JSON.stringify(c)); }
      }
      var profKey = typeof AXPFCK === 'string' ? AXPFCK : 'fs_ai_profiles';
      var rawProf = localStorage.getItem(profKey);
      if (rawProf && rawProf.indexOf(BAD) > -1) {
        var j = JSON.parse(rawProf);
        if (j && Array.isArray(j.list)) {
          var ch = false;
          j.list.forEach(function (p) { if (p && p.model === BAD) { p.model = GOOD; ch = true; } });
          if (ch) localStorage.setItem(profKey, JSON.stringify(j));
        }
      }
    } catch (_) {}
  }
  fixAnthropicModel();

  if (typeof axCfgDraft === 'function') {
    var _axCfgDraft0 = axCfgDraft;
    axCfgDraft = function () {
      var d = _axCfgDraft0.apply(this, arguments);
      if (d && d.model === 'claude-haiku-5-5') d.model = 'claude-haiku-4-5';
      return d;
    };
  }

  if (typeof aiCloudAnthropic === 'function') {
    aiCloudAnthropic = async function (q, key) {
      var ctx = typeof aiContext === 'function' ? aiContext(q) : '';
      var r;
      try {
        r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 600,
            system: typeof AI_SYS !== 'undefined' ? AI_SYS : '',
            messages: [{ role: 'user', content: ctx + '\n\nسؤال المندوب: ' + q }]
          })
        });
      } catch (_) {
        throw new Error('مفيش اتصال بالإنترنت، جرّب بعدين');
      }
      if (r.status === 401 || r.status === 403) throw new Error('المفتاح غلط أو مش شغال');
      if (!r.ok) throw new Error('الخدمة رجعت خطأ ' + r.status + '، جرّب بعدين');
      var j = await r.json();
      return ((j && j.content) || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n').trim() || 'مرجعش رد';
    };
  }

  // ---------------- 5. Lock Screen & Masked PIN Sheet + Escape Key ----------------
  lockView = function () {
    return '<div class="card lockwrap">' +
      '<div class="lockico">🔒</div>' +
      '<h1 style="font-size:22px;margin-bottom:4px">التطبيق مقفول</h1>' +
      '<p class="mu" style="margin:0 0 14px">اكتب الرقم السري لفتح بيانات المندوب</p>' +
      '<input id="pin" type="password" inputmode="numeric" autocomplete="one-time-code" placeholder="الرقم السري" onkeydown="if(event.key===\'Enter\')unlock()">' +
      '<button class="btn" onclick="unlock()">🔓 دخول</button>' +
      '</div>';
  };

  setPin = function () {
    openSheet(
      '<h2 style="margin:0 0 10px">' + (S.pin ? '🔑 تغيير الرقم السري' : '🔒 تفعيل رقم سري') + '</h2>' +
      '<p class="mu" style="margin:0 0 10px">اختار من 4 إلى 8 أرقام</p>' +
      '<label class="lb" for="pin1">الرقم السري الجديد</label>' +
      '<input id="pin1" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="••••" onkeydown="if(event.key===\'Enter\')document.getElementById(\'pin2\').focus()">' +
      '<label class="lb" for="pin2">تأكيد الرقم السري</label>' +
      '<input id="pin2" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="••••" onkeydown="if(event.key===\'Enter\')savePinSheet()">' +
      '<button class="btn" onclick="savePinSheet()">✔ حفظ القفل</button>' +
      '<button class="btn t" onclick="closeSheet()">إلغاء</button>'
    );
    setTimeout(function () { var el = $('pin1'); if (el) el.focus(); }, 120);
  };

  window.savePinSheet = function () {
    var p1 = ($('pin1') && $('pin1').value || '').trim();
    var p2 = ($('pin2') && $('pin2').value || '').trim();
    if (p1.length < 4) return toast('اكتب 4 أرقام على الأقل');
    if (p1 !== p2) return toast('الرقمين مش متطابقين');
    S.pin = hp(p1);
    unl = true;
    save();
    closeSheet();
    toast('تم تفعيل القفل');
    render();
  };

  doc.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      var sh = $('sheet');
      if (sh && sh.classList.contains('open')) closeSheet();
      if (doc.body.classList.contains('agopen') && typeof agClose === 'function') agClose();
    }
  });

  // ---------------- 6. Global Quick Search (🔍) ----------------
  window.openSearch = function () {
    openSheet(
      '<div class="shrow" style="margin-bottom:8px"><b>🔍 بحث سريع</b><button class="linkbtn" style="padding:4px 8px" onclick="closeSheet()">إغلاق</button></div>' +
      '<input id="qsInp" type="search" placeholder="ابحث عن عميل، قرية، منتج، مادة فعالة..." oninput="qSearchRun(this.value)">' +
      '<div id="qsRes"><p class="mu">اكتب اسم عميل أو قرية أو منتج أو مادة فعالة للوصول السريع.</p></div>'
    );
    setTimeout(function () { var el = $('qsInp'); if (el) el.focus(); }, 100);
  };

  window.qSearchRun = function (q) {
    var el = $('qsRes');
    if (!el) return;
    var nq = norm(q);
    if (!nq) {
      el.innerHTML = '<p class="mu">اكتب اسم عميل أو قرية أو منتج أو مادة فعالة للوصول السريع.</p>';
      return;
    }
    var toks = nq.split(/\s+/).filter(Boolean);
    var hasAll = function (hay) {
      var nh = norm(hay);
      return toks.every(function (t) { return nh.indexOf(t) > -1; });
    };

    var cs = (S.customers || []).filter(function (c) {
      return hasAll([c.name, c.shop, c.village, c.mz, c.crop, c.phone, c.note].join(' '));
    }).slice(0, 6);

    var ps = (S.products || []).filter(function (p) {
      return hasAll([p.name, p.ai, p.sz, p.cat, p.bc].join(' '));
    }).slice(0, 6);

    var os = (S.orders || []).filter(function (o) {
      if (o.cx) return false;
      var c = C(o.cid);
      var itemNames = (o.items || []).map(function (i) { return i.name; }).join(' ');
      return hasAll([(c && c.name) || '', (c && c.village) || '', itemNames].join(' '));
    }).sort(function (a, b) { return b.t - a.t; }).slice(0, 4);

    var out = '';
    if (cs.length) {
      out += '<div class="qs-sec">العملاء (' + cs.length + ')</div>' + cs.map(function (c) {
        var b = bal(c.id);
        var bHtml = b > 0 ? '<span class="pill red">' + esc(M(b)) + '</span>' : b < 0 ? '<span class="pill grn">ليه ' + esc(M(-b)) + '</span>' : '';
        return '<div class="item"><button class="itm-main" onclick="closeSheet();open_(\'' + jsEsc(c.id) + '\')"><span class="grow"><span class="nm">' + esc(c.name) + '</span><span class="sb">' + esc([c.shop, c.village, c.mz].filter(Boolean).join(' • ') || '—') + '</span></span>' + bHtml + '</button></div>';
      }).join('');
    }
    if (ps.length) {
      out += '<div class="qs-sec">المنتجات (' + ps.length + ')</div>' + ps.map(function (p) {
        return '<div class="item"><button class="itm-main" onclick="closeSheet();v={tab:\'prod\',pf:\'' + jsEsc(p.id) + '\'};render()"><span class="grow"><span class="nm">' + esc(p.name) + '</span><span class="sb">' + (p.price > 0 ? esc(M(p.price)) + ' / ' + esc(p.unit) : 'بدون سعر') + ' • متاح ' + esc(r2(p.stock)) + (p.ai ? ' • ' + esc(p.ai.slice(0, 35)) : '') + '</span></span></button></div>';
      }).join('');
    }
    if (os.length) {
      out += '<div class="qs-sec">أحدث الطلبات (' + os.length + ')</div>' + os.map(function (o) {
        var c = C(o.cid);
        return '<div class="item"><button class="itm-main" onclick="closeSheet();v={tab:\'cust\',inv:\'' + jsEsc(o.id) + '\'};render()"><span class="grow"><span class="nm">' + esc((c && c.name) || 'عميل') + ' — ' + esc(M(o.total)) + '</span><span class="sb">' + esc(dt(o.t)) + ' • ' + esc((o.items || []).map(function (i) { return i.name; }).slice(0, 2).join('، ')) + '</span></span></button></div>';
      }).join('');
    }
    el.innerHTML = out || '<div class="empty" style="padding:20px 8px">مفيش نتائج مطابقة للبحث ده</div>';
  };

  if (typeof screenHead === 'function') {
    var _sh0 = screenHead;
    screenHead = function (title, sub, act) {
      var a = act;
      if (!a && typeof v !== 'undefined' && v && !v.cedit && !v.addc && !v.pf) {
        a = '<button class="qsearch-btn" onclick="openSearch()" aria-label="بحث سريع" title="بحث سريع">🔍</button>';
      }
      return _sh0(title, sub, a);
    };
  }

  // ---------------- 7. Normalized Arabic Multi-Word Search ----------------
  function matchTokens(hay, q) {
    var nq = norm(q);
    if (!nq) return true;
    var nh = norm(hay);
    var toks = nq.split(/\s+/).filter(Boolean);
    return toks.every(function (t) { return nh.indexOf(t) > -1; });
  }

  custFiltered = function (q) {
    var sv = seenSet();
    return S.customers.filter(function (c) {
      if (q && !matchTokens([c.name, c.village, c.shop, c.crop, c.mz, c.phone, c.note].join(' '), q)) return false;
      var b = bal(c.id), seen = sv.has(c.id);
      if (cfl === 'debt') return b > 0;
      if (cfl === 'cred') return b < 0;
      if (cfl === 'never') return !seen;
      if (cnv) return !seen;
      return true;
    });
  };

  plist = function (q) {
    var l = S.products.filter(function (p) {
      return !q || matchTokens([p.name, p.ai, p.sz, p.cat, p.bc].join(' '), q);
    });
    return l.length ? l.map(function (p) {
      var inC = !!(cart[p.id] && cart[p.id].q > 0), qq = inC ? cart[p.id].q : 0;
      var price = (p.price > 0 ? M(p.price) + ' / ' + p.unit : '⚠ السعر مش محدد') + (p.sz ? ' • ' + p.sz : '');
      var pid = jsEsc(p.id);
      return '<div class="item"><div class="grow"><span class="nm">' + esc(p.name) + (isLow(p) ? ' <span class="pill amb">قرب يخلص</span>' : '') + '</span><span class="sb">' + esc(price) + ' • متاح ' + esc(r2(p.stock)) + '</span></div>' +
        (inC ? '<div class="step"><button onclick="chg(\'' + pid + '\',-1)" aria-label="قلل ' + esc(p.name) + '">−</button><b>' + qq + '</b><button onclick="chg(\'' + pid + '\',1)" aria-label="زوّد ' + esc(p.name) + '">＋</button></div>'
          : '<button class="icobtn" style="background:var(--prl);color:var(--pr);border-color:transparent;font-size:22px;font-weight:700" onclick="addc(\'' + pid + '\')" aria-label="أضف ' + esc(p.name) + '">＋</button>') +
        '</div>';
    }).join('') : '<div class="empty"><div class="ico">📦</div>ضيف منتجات من تبويب المنتجات الأول</div>';
  };

  prodList = function () {
    var l = S.products.filter(function (p) {
      return (pcat === 'all' || p.cat === pcat) && (!pq || matchTokens([p.name, p.ai, p.sz, p.cat, p.bc].join(' '), pq));
    });
    if (!l.length) return '<div class="empty"><div class="ico">📦</div>' + (S.products.length ? 'مفيش منتجات بالفلتر ده' : 'ضيف أول منتج من فوق') + '</div>';
    var card = function (p) {
      var low = isLow(p), pct = p.min > 0 ? Math.min(100, Math.round(p.stock / (p.min * 3) * 100)) : (p.stock > 0 ? 100 : 0);
      var st = p.stock <= 0 ? '<span class="pill red">خلص</span>' : low ? '<span class="pill amb">قرب يخلص</span>' : '<span class="pill grn">متاح</span>';
      var pid = jsEsc(p.id);
      return '<div class="item" style="display:block"><div class="shrow"><div style="min-width:0"><div class="nm">' + esc(p.name) + '</div><div class="sb">' +
        (p.price > 0 ? esc(M(p.price)) + ' / ' + esc(p.unit) : '<span class="amb">⚠ حدّد السعر</span> • ' + esc(p.unit)) +
        (p.sz ? ' • ' + esc(p.sz) : '') + '</div></div>' + st + '</div>' +
        (p.ai ? '<div class="mu" style="font-size:13px;margin-top:6px">' + esc(p.ai.length > 90 ? p.ai.slice(0, 90) + '…' : p.ai) + '</div>' : '') +
        '<div class="shrow" style="margin-top:10px"><div class="bar"><span style="width:' + pct + '%"></span></div><div class="acts"><b style="min-width:40px;text-align:center">' + esc(r2(p.stock)) + '</b><button class="qb" onclick="restock(\'' + pid + '\')" aria-label="زوّد المخزون">＋</button><button class="qb" onclick="v={tab:\'prod\',pf:\'' + pid + '\'};render()" aria-label="تعديل">✎</button></div></div></div>';
    };
    if (pcat !== 'all') return l.map(card).join('');
    return CATS.map(function (c) {
      var g = l.filter(function (p) { return p.cat === c; });
      return g.length ? '<h2>' + c + '</h2>' + g.map(card).join('') : '';
    }).join('') + l.filter(function (p) { return CATS.indexOf(p.cat) < 0; }).map(card).join('');
  };

  // ---------------- 8. Order UX, Credit Warning & Stock r2() Precision ----------------
  window.ordPayMode = function (mode) {
    var el = $('paid');
    if (!el) return;
    if (mode === 'cash') el.value = r2(Math.max(sub() - dsc(), 0));
    else el.value = '0';
    upTot();
  };

  if (typeof upTot === 'function') {
    var _upTot0 = upTot;
    upTot = function () {
      _upTot0.apply(this, arguments);
      var warn = $('credwarn');
      if (!warn) return;
      var c = typeof v !== 'undefined' && v.order ? C(v.order) : null;
      if (!c || !(c.lim > 0)) { warn.style.display = 'none'; return; }
      var total = r2(Math.max(sub() - dsc(), 0));
      var paid = Math.max(0, num(($('paid') && $('paid').value) || 0) || 0);
      var rem = r2(Math.max(0, total - paid));
      var nextBal = r2(bal(c.id) + rem);
      if (rem > 0 && nextBal > c.lim) {
        warn.style.display = 'block';
        warn.innerHTML = '⚠ تنبيه: رصيد العميل بعد الطلب هيبقى <b>' + esc(M(nextBal)) + '</b>، وده أعلى من حد الائتمان (' + esc(M(c.lim)) + ')';
      } else {
        warn.style.display = 'none';
      }
    };
  }

  if (typeof orderView === 'function') {
    var _orderView0 = orderView;
    orderView = function () {
      var h = _orderView0.apply(this, arguments);
      var target = '<input id="paid" type="number" inputmode="decimal" placeholder="0">';
      if (h.indexOf(target) > -1) {
        h = h.replace(target, '<input id="paid" type="number" inputmode="decimal" placeholder="0" oninput="upTot()">');
      }
      var marker = '<input id="psearch"';
      var idx = h.indexOf(marker);
      if (idx > -1) {
        var extra = '<div class="row" style="gap:8px;margin-top:4px"><button type="button" class="btn t sm" onclick="ordPayMode(\'cash\')">💵 كاش بالكامل</button><button type="button" class="btn t sm" onclick="ordPayMode(\'credit\')">📝 آجل (0)</button></div><div id="credwarn" class="credwarn" style="display:none"></div></div>';
        var closeCartIdx = h.lastIndexOf('</div>', idx);
        if (closeCartIdx > -1) h = h.slice(0, closeCartIdx) + extra + h.slice(closeCartIdx + 6);
      }
      return h;
    };
  }

  confirmO = function () {
    var cid = v.order, ids = Object.keys(cart);
    if (!ids.length) return toast('ضيف منتجات الأول');
    for (var k = 0; k < ids.length; k++) {
      var id = ids[k], p = P(id);
      if (!p) return toast('منتج محذوف في السلة');
      if (r2(p.stock) < r2(cart[id].q)) return toast('المخزون مش كفاية: ' + p.name);
    }
    var s = r2(sub()), d = r2(dsc());
    if (d > s) return toast('الخصم أكبر من الإجمالي');
    var total = r2(s - d), paid = r2(num($('paid').value) || 0);
    if (paid < 0 || paid > total) return toast('المبلغ المدفوع غير صحيح');
    var oid = uid(), t = Date.now();
    S.orders.push({
      id: oid, cid: cid, t: t, total: total, paid: paid, disc: d,
      items: ids.map(function (i) { return { pid: i, name: P(i).name, qty: cart[i].q, price: cart[i].p }; })
    });
    ids.forEach(function (i) { var pr = P(i); if (pr) pr.stock = r2(pr.stock - cart[i].q); });
    if (total > 0) S.ledger.push({ id: uid(), cid: cid, type: 'OWES', amt: total, t: t, oid: oid, note: 'طلب' });
    if (paid > 0) S.ledger.push({ id: uid(), cid: cid, type: 'PAID', amt: paid, t: t, oid: oid, note: 'دفع وقت الطلب' });
    autoVisit(cid);
    save();
    cart = {};
    toast('تم تأكيد الطلب');
    v = { tab: 'cust', inv: oid };
    render();
  };

  cancelO = function (oid) {
    var o = S.orders.find(function (x) { return x.id === oid; });
    if (!o || o.cx || !confirm('تلغي الطلب ده؟ هيرجّع المخزون ويشيل الحساب المرتبط بيه')) return;
    o.items.forEach(function (i) { var p = P(i.pid); if (p) p.stock = r2(p.stock + i.qty); });
    S.ledger = S.ledger.filter(function (l) { return l.oid !== oid; });
    o.cx = true;
    save();
    toast('تم إلغاء الطلب');
    render();
  };

  restock = function (i) {
    var p = P(i);
    if (!p) return;
    var q = num(prompt('الكمية اللي وصلت:'));
    if (!(q > 0)) return;
    p.stock = r2((p.stock || 0) + q);
    save();
    render();
  };

  // ---------------- 9. Collection Sheet Note, Duplicate Phone Check & 0-Price ----------------
  window._colNote = '';
  if (typeof collect === 'function') {
    var _collect0 = collect;
    collect = function (cid) {
      window._colNote = '';
      return _collect0.apply(this, arguments);
    };
  }

  if (typeof colSheet === 'function') {
    var _colSheet0 = colSheet;
    colSheet = function (cid) {
      _colSheet0.apply(this, arguments);
      var sb = $('sheetBody');
      if (!sb || $('colNoteInp')) return;
      var btn = sb.querySelector('button[onclick*="colDo"]');
      if (btn) {
        btn.insertAdjacentHTML('beforebegin',
          '<input id="colNoteInp" placeholder="ملاحظة (اختياري: شيك، تحويل، دفعة...)" value="' + esc(window._colNote || '') + '" oninput="window._colNote=this.value">'
        );
      }
    };
  }

  colDo = function (cid) {
    var a = r2(num(colAmt) || 0);
    if (!(a > 0)) return toast('اكتب مبلغ الأول');
    var note = ((($('colNoteInp') && $('colNoteInp').value) || window._colNote || '')).trim() || 'تحصيل';
    S.ledger.push({ id: uid(), cid: cid, type: 'PAID', amt: a, t: Date.now(), note: note });
    autoVisit(cid);
    save();
    colAmt = '';
    window._colNote = '';
    closeSheet();
    toast('تم تسجيل ' + M(a));
    render();
  };

  if (typeof saveC === 'function') {
    var _saveC0 = saveC;
    saveC = function () {
      var ph = ($('cp') && $('cp').value || '').trim();
      var wn = typeof waNum === 'function' ? waNum(ph) : '';
      if (wn.length >= 10) {
        var dup = S.customers.find(function (c) {
          return (!v.cedit || c.id !== v.cedit) && waNum(c.phone) === wn;
        });
        if (dup && !confirm('الرقم ده متسجّل بالفعل عند العميل «' + dup.name + '». تحفظ برضه؟')) return;
      }
      return _saveC0.apply(this, arguments);
    };
  }

  saveP = function () {
    var n = ($('pn') && $('pn').value || '').trim();
    var pRaw = ($('pp') && $('pp').value || '').trim();
    var pr = pRaw === '' ? 0 : num(pRaw);
    if (!n || !(pr >= 0)) return toast('اكتب اسم المنتج وسعر صحيح');
    var d = {
      name: n,
      cat: $('pc').value,
      unit: $('pu').value,
      price: r2(pr),
      stock: r2(num($('ps').value) || 0),
      min: r2(num($('pm').value) || 0),
      ai: ($('pa') && $('pa').value || '').trim(),
      sz: ($('psz') && $('psz').value || '').trim()
    };
    if (v.pf) {
      var old = P(v.pf);
      if (!old) return toast('المنتج ده اتحذف');
      Object.assign(old, d);
      save();
      toast('تم التعديل');
      return go('prod');
    }
    S.products.push(Object.assign({ id: uid() }, d));
    save();
    toast('تم الحفظ');
    render();
  };

  // ---------------- 10. Theme Toggle in Settings + Excel/CSV Export ----------------
  if (typeof setView === 'function') {
    var _setView0 = setView;
    setView = function () {
      var h = _setView0.apply(this, arguments);
      var t = (S && S.theme) || 'auto';
      var chip = function (k, label) {
        return '<button class="' + (t === k ? 'on' : '') + '" onclick="setTheme(\'' + k + '\')">' + label + '</button>';
      };
      var themeCard = '<h2>🎨 المظهر (الوضع الليلي)</h2>' +
        '<div class="seg">' + chip('auto', 'تلقائي') + chip('light', '☀️ نهاري') + chip('dark', '🌙 ليلي') + '</div>';
      var marker = '<h2>النسخ الاحتياطي</h2>';
      var idx = h.indexOf(marker);
      return idx > -1 ? h.slice(0, idx) + themeCard + h.slice(idx) : themeCard + h;
    };
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v).replace(/\r?\n/g, ' ');
    if (/^[=+\-@\t]/.test(s) && !/^-\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  window.csvDl = function (filename, headers, rows) {
    try {
      var lines = [headers.map(csvCell).join(',')].concat(rows.map(function (r) { return r.map(csvCell).join(','); }));
      var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = doc.createElement('a');
      a.href = url;
      a.download = filename;
      doc.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) {} }, 2500);
      toast('تم تنزيل ملف الإكسيل');
    } catch (_) {
      toast('تعذر إنشاء الملف');
    }
  };

  window.exportDebtsCsv = function () {
    var l = S.customers.map(function (c) { return { c: c, b: bal(c.id) }; }).filter(function (x) { return x.b > 0; }).sort(function (a, b) { return b.b - a.b; });
    if (!l.length) return toast('مفيش مديونيات للتصدير');
    var rows = l.map(function (x) {
      return [x.c.name, x.c.shop || '', x.c.village || '', x.c.mz || '', x.c.phone || '', r2(x.b)];
    });
    csvDl('debts-' + new Date().toISOString().slice(0, 10) + '.csv', ['العميل', 'المحل / المزرعة', 'القرية', 'المركز', 'التليفون', 'المتبقي (جنيه)'], rows);
  };

  window.exportSalesCsv = function () {
    var now = Date.now(), st = { d: day0(), w: now - 6048e5, m: now - 2592e6, a: 0 }[rp] || 0;
    var os = S.orders.filter(function (o) { return !o.cx && o.t >= st; }).sort(function (a, b) { return b.t - a.t; });
    if (!os.length) return toast('مفيش طلبات في الفترة دي');
    var rows = os.map(function (o) {
      var c = C(o.cid) || {};
      var items = (o.items || []).map(function (i) { return i.name + ' ×' + i.qty; }).join(' | ');
      return [dt(o.t), c.name || '', c.village || '', r2(o.total), r2(o.paid), r2(o.total - o.paid), items];
    });
    csvDl('sales-' + rp + '-' + new Date().toISOString().slice(0, 10) + '.csv', ['التاريخ', 'العميل', 'القرية', 'الإجمالي', 'المدفوع', 'المتبقي', 'الأصناف'], rows);
  };

  if (typeof debtsView === 'function') {
    var _debtsView0 = debtsView;
    debtsView = function () {
      var h = _debtsView0.apply(this, arguments);
      if (S.customers.some(function (c) { return bal(c.id) > 0; })) {
        h += '<button class="btn t" onclick="exportDebtsCsv()">📊 تصدير المديونيات (Excel / CSV)</button>';
      }
      return h;
    };
  }

  if (typeof repView === 'function') {
    var _repView0 = repView;
    repView = function () {
      var h = _repView0.apply(this, arguments);
      var btn = '<button class="btn t" onclick="exportSalesCsv()">📊 تصدير مبيعات الفترة (Excel / CSV)</button>';
      var marker = '<h2>أكتر المنتجات مبيعًا</h2>';
      var idx = h.indexOf(marker);
      return idx > -1 ? h.slice(0, idx) + btn + h.slice(idx) : h + btn;
    };
  }

  try {
    applyTheme();
    if (typeof render === 'function') render();
  } catch (_) {}

  console.log('⚡ pro.js ready');
})();
