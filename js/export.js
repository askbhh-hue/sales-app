/* =====================================================================
   export.js  -  export your data to CSV (opens in Excel / Google Sheets).
   - Reads S only (never changes data). Works offline.
   - UTF-8 with BOM so Arabic shows correctly in Excel. Phones keep their leading zero.
   - iPhone: opens the share sheet (Save to Files / Mail / WhatsApp...). Elsewhere: normal download.
   Exposes: window.EXP { kinds, build(kind), run(kind), screen(), csv(rows) }
   ===================================================================== */
(function () {
  'use strict';
  const E = window.EXP = {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const p2 = n => (n < 10 ? '0' : '') + n;
  const when = t => { if (!t || !isFinite(+t)) return ''; const d = new Date(+t); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); };
  const num = n => { n = +n; return isFinite(n) ? Math.round(n * 100) / 100 : ''; };
  const S_ = () => (typeof S !== 'undefined' && S) || { customers: [], products: [], orders: [], ledger: [], visits: [] };
  const cname = id => { const c = (S_().customers || []).find(x => x.id === id); return c ? c.name : '(عميل محذوف)'; };
  const cvil = id => { const c = (S_().customers || []).find(x => x.id === id); return c ? (c.village || '') : ''; };

  // ---- CSV cell rules
  //  * numbers stay numbers; text starting with = + - @ gets a leading apostrophe-free guard (a space) so Excel never runs it as a formula
  //  * phone numbers are written as ="0100..." so Excel keeps the leading zero
  class Raw { constructor(s) { this.s = s; } }
  const phone = v => { const d = String(v == null ? '' : v).replace(/[^\d+]/g, ''); return d ? new Raw('="' + d + '"') : ''; };
  function cell(v) {
    if (v instanceof Raw) return v.s;
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = ' ' + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  E.csv = rows => '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

  // ---- datasets
  const balOf = id => (typeof bal === 'function') ? bal(id) : (S_().ledger || []).filter(l => l.cid === id).reduce((s, l) => s + (l.type === 'OWES' ? l.amt : -l.amt), 0);
  const D = {
    customers: {
      title: 'العملاء', icon: '👥',
      head: ['الاسم', 'التليفون', 'المحل', 'المركز', 'القرية', 'المحصول', 'خصم %', 'الرصيد (عليه +)', 'ملاحظات', 'خط العرض', 'خط الطول'],
      rows: s => (s.customers || []).map(c => [c.name, phone(c.phone), c.shop, c.mz, c.village, c.crop, num(c.disc), num(balOf(c.id)), c.note, c.lat == null ? '' : num(c.lat * 1), c.lng == null ? '' : num(c.lng * 1)])
    },
    orders: {
      title: 'الطلبات', icon: '🧾',
      head: ['التاريخ', 'العميل', 'القرية', 'الأصناف', 'الإجمالي', 'المدفوع', 'خصم', 'الحالة'],
      rows: s => (s.orders || []).slice().sort((a, b) => (b.t || 0) - (a.t || 0)).map(o => [when(o.t), cname(o.cid), cvil(o.cid),
        (o.items || []).filter(i => i && i.qty > 0).map(i => (i.name || '؟') + ' × ' + i.qty).join(' ، '), num(o.total), num(o.paid), num(o.disc), o.cx ? 'ملغي' : 'سليم'])
    },
    ledger: {
      title: 'الحسابات (عليه / دفع)', icon: '💰',
      head: ['التاريخ', 'العميل', 'القرية', 'النوع', 'المبلغ', 'ملاحظة'],
      rows: s => (s.ledger || []).slice().sort((a, b) => (b.t || 0) - (a.t || 0)).map(l => [when(l.t), cname(l.cid), cvil(l.cid), l.type === 'OWES' ? 'عليه' : 'دفع', num(l.amt), l.note])
    },
    visits: {
      title: 'الزيارات', icon: '📍',
      head: ['التاريخ', 'العميل', 'القرية', 'النوع'],
      rows: s => (s.visits || []).slice().sort((a, b) => (b.t || 0) - (a.t || 0)).map(x => [when(x.t), cname(x.cid), cvil(x.cid), x.auto === 5 ? 'تسجيل أولي تلقائي' : 'زيارة'])
    },
    products: {
      title: 'المنتجات والمخزون', icon: '📦',
      head: ['المنتج', 'الفئة', 'الوحدة', 'السعر', 'التكلفة', 'المخزون', 'الحد الأدنى', 'الحجم'],
      rows: s => (s.products || []).map(p => [p.name, p.cat, p.unit, num(p.price), num(p.cost), num(p.stock), num(p.min), p.sz])
    }
  };
  E.kinds = Object.keys(D);

  E.build = function (kind) {
    const d = D[kind]; if (!d) throw new Error('نوع غير معروف');
    const s = S_(), rows = [d.head].concat(d.rows(s));
    const dt = new Date(), stamp = dt.getFullYear() + p2(dt.getMonth() + 1) + p2(dt.getDate());
    return { name: 'sales-' + kind + '-' + stamp + '.csv', csv: E.csv(rows), count: rows.length - 1, title: d.title };
  };

  // ---- deliver: share sheet when the phone has one, else a normal download
  E.run = async function (kind) {
    let b;
    try { b = E.build(kind); } catch (er) { try { toast('✘ ' + er.message); } catch (_) {} return { ok: false }; }
    if (!b.count) { try { toast('مفيش ' + b.title + ' تتصدّر لسه'); } catch (_) {} return { ok: false, empty: true }; }
    const blob = new Blob([b.csv], { type: 'text/csv;charset=utf-8' });
    try {
      const f = new File([blob], b.name, { type: 'text/csv' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: b.title }); try { toast('✔ ' + b.count + ' صف'); } catch (_) {} return { ok: true, via: 'share', count: b.count }; }
    } catch (er) { if (er && er.name === 'AbortError') return { ok: false, cancelled: true }; /* otherwise fall through to download */ }
    try {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = b.name; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      try { toast('✔ نزل ملف ' + b.count + ' صف'); } catch (_) {}
      return { ok: true, via: 'download', count: b.count };
    } catch (er) { try { toast('✘ الجهاز مش مسمّح بالتنزيل هنا'); } catch (_) {} return { ok: false }; }
  };

  E.screen = function () {
    const s = S_();
    const cnt = { customers: (s.customers || []).length, orders: (s.orders || []).length, ledger: (s.ledger || []).length, visits: (s.visits || []).length, products: (s.products || []).length };
    return screenHead('تصدير البيانات', 'ملفات CSV بتفتح في Excel') +
      '<div class="card mu" style="margin-bottom:10px">اختار اللي عايز تصدّره. هيفتح لك قايمة المشاركة (احفظ في «الملفات» أو ابعت على الإيميل/واتساب). الأرقام والتليفونات محفوظة صح، والعربي بيظهر سليم.</div>' +
      E.kinds.map(k => '<button class="btn t" style="display:flex;justify-content:space-between;align-items:center" onclick="EXP.run(\'' + k + '\')"><span>' + D[k].icon + ' ' + esc(D[k].title) + '</span><span class="mu">' + cnt[k] + ' صف</span></button>').join('') +
      '<button class="btn t" style="margin-top:14px" onclick="v={tab:\'more\'};render()">رجوع</button>';
  };
})();
