/* WhatsApp layer (free, wa.me based): per-customer message history, quick templates, AI read tool.
   Builds on the existing S.msgLog, TPL, msgFor, wa(), AXA.sendMsg and compose_message tool. Nothing is sent automatically. */
(function () {
  'use strict';
  const KIND = { debt: 'مديونية', offer: 'عرض', visit: 'زيارة', thanks: 'شكر', intro: 'تعارف', stmt: 'كشف حساب', custom: 'رسالة' };
  const CH = { wa: 'واتساب', sms: 'SMS' };
  const esc = s => (typeof e === 'function' ? e(s) : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const log = () => (S.msgLog = S.msgLog || []);
  const ago = t => { const d = Math.floor((Date.now() - t) / 864e5); return d <= 0 ? 'النهارده' : d === 1 ? 'امبارح' : 'من ' + d + ' يوم'; };
  const W = {};
  W.hist = cid => log().filter(m => m.cid === cid).sort((a, b) => b.t - a.t);
  W.last = cid => W.hist(cid)[0] || null;
  // add text/kind to the newest log row of this customer (rows made by the old code have only cid/t/ch)
  W.tag = (cid, text, kind) => { const r = W.last(cid); if (r && !r.x) { r.x = String(text || '').slice(0, 300); if (kind) r.k = kind; } };
  W.quick = (cid, k) => {
    const c = C(cid); if (!c) return toast('العميل مش موجود');
    if (typeof waNum !== 'function' || waNum(c.phone).length < 11) return toast('العميل ده من غير رقم صالح');
    if (k === 'debt' && !(bal(c.id) > 0)) return toast('مفيش مديونية على العميل ده');
    const text = msgFor(c, TPL[k]) + (S.repName ? '\n' + S.repName : '');
    log().push({ id: uid(), cid, t: Date.now(), ch: 'wa', k, x: text.slice(0, 300) }); save();
    const a = document.createElement('a'); a.href = wa(c.phone, text); a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(render, 400);
  };
  W.card = cid => {
    const c = C(cid); if (!c) return '';
    const h = W.hist(cid), ok = typeof waNum === 'function' && waNum(c.phone).length >= 11;
    const rows = h.slice(0, 5).map(m => `<div class="item"><div class="grow"><span class="nm">${esc(KIND[m.k] || 'رسالة')} • ${esc(CH[m.ch] || m.ch || '')}</span><span class="sb">${esc(ago(m.t))} — ${esc(new Date(m.t).toLocaleDateString('ar-EG'))}${m.x ? '<br>' + esc(m.x.slice(0, 90)) + (m.x.length > 90 ? '…' : '') : ''}</span></div></div>`).join('');
    const btn = (k, l) => `<button class="btn t sm" onclick="WA.quick('${esc(cid)}','${k}')">${l}</button>`;
    return `<div class="card"><b>💬 المراسلات</b>
      <div class="mu">${h.length ? 'آخر رسالة ' + esc(ago(h[0].t)) + ' • إجمالي ' + h.length : 'لسه ما بعتّلوش رسايل من التطبيق'}</div>
      ${rows}
      ${ok ? `<div class="row" style="margin-top:8px">${btn('debt', '💰 مديونية')}${btn('offer', '🌾 عرض')}${btn('visit', '🚗 زيارة')}${btn('thanks', '🙏 شكر')}</div><div class="mu">هتفتح واتساب والرسالة جاهزة، وإنت اللي بتدوس إرسال.</div>` : '<div class="mu">مفيش رقم صالح للعميل ده.</div>'}</div>`;
  };
  W.who = (days, kind) => {
    const lim = Date.now() - (days || 7) * 864e5;
    let l = S.customers.filter(c => typeof waNum === 'function' && waNum(c.phone).length >= 11);
    if (kind === 'debt') l = l.filter(c => bal(c.id) > 0);
    else if (kind === 'late' && typeof lateList === 'function') { const ids = new Set(lateList().map(x => x.c.id)); l = l.filter(c => ids.has(c.id)); }
    return l.filter(c => { const r = W.last(c.id); return !r || r.t < lim; }).sort((a, b) => bal(b.id) - bal(a.id)).slice(0, 15);
  };
  W.tool = a => {
    if (a.action === 'who_to_contact') {
      const l = W.who(+a.days || 7, a.kind);
      return { ok: true, count: l.length, note: 'عملاء لسه ما اتبعتلهمش رسالة في الفترة دي. للإرسال استخدم compose_message.', customers: l.map(c => ({ name: c.name, village: c.village || '', owes: Math.round(bal(c.id)), last_message: (W.last(c.id) ? ago(W.last(c.id).t) : 'عمره ما اتبعتله') })) };
    }
    const r = axRC(a.customer_name); if (r.err) return { ok: false, error: r.err, cands: r.cands };
    const h = W.hist(r.c.id);
    return { ok: true, customer: r.c.name, total: h.length, messages: h.slice(0, 10).map(m => ({ when: ago(m.t), channel: CH[m.ch] || m.ch, kind: KIND[m.k] || 'رسالة', text: (m.x || '').slice(0, 120) })) };
  };

  function install() {
    if (typeof AXA !== 'undefined' && AXA.sendMsg && !AXA.sendMsg._w) {
      const A0 = AXA.sendMsg.A;
      AXA.sendMsg.A = function (p) { const r = A0.apply(this, arguments); try { if (r && !r.err) W.tag(p.cid, p.text, 'custom'); } catch (_) {} save(); return r; };
      AXA.sendMsg._w = 1;
    }
    if (typeof msgMark === 'function' && !msgMark._w) {
      const m0 = msgMark;
      msgMark = function (ch) { const q = mq; let cid, txt; if (q) { cid = q.ids[q.i]; try { txt = msgFor(C(cid), q.t); } catch (_) {} } const r = m0.apply(this, arguments); if (cid) { W.tag(cid, txt, null); save(); } return r; };
      msgMark._w = 1;
    }
    if (typeof custView === 'function' && !custView._w) {
      const c0 = custView;
      custView = function () { const h = c0.apply(this, arguments); try { return h + W.card(v.cid); } catch (_) { return h; } };
      custView._w = 1;
    }
    if (typeof AXT !== 'undefined' && AXT.push && !AXT.some(t => t.name === 'whatsapp_history')) {
      AXT.push({ name: 'whatsapp_history', description: 'سجل رسائل الواتساب: action=history لتاريخ الرسايل مع عميل معين، action=who_to_contact لعملاء محتاجين رسالة (kind=debt للمديونيات، late للمتأخرين، days=عدد الأيام من آخر رسالة). للقراءة بس، ومبتبعتش حاجة. للإرسال استخدم compose_message.',
        parameters: { type: 'object', properties: { action: { type: 'string', enum: ['history', 'who_to_contact'] }, customer_name: { type: 'string' }, kind: { type: 'string', enum: ['debt', 'late', 'all'] }, days: { type: 'number' } }, required: ['action'] } });
      const eat = executeAgentTool;
      executeAgentTool = async function (name, a) {
        if (name === 'whatsapp_history') { try { return W.tool(a || {}); } catch (er) { return { ok: false, error: 'خطأ: ' + er.message }; } }
        return eat.apply(this, arguments);
      };
    }
  }
  window.WA = W;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(install, 0)); else setTimeout(install, 0);
})();
