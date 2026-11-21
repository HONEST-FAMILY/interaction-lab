(function () {
  'use strict';
  var RAW = JSON.parse(document.getElementById('deck-data').textContent);
  var BOARD = RAW.board || null;
  var app = document.getElementById('app');
  var stage = document.getElementById('stage');
  var bars = document.getElementById('bars');
  var topLabel = document.getElementById('toplabel');
  var prevBtn = document.getElementById('prev');
  var nextBtn = document.getElementById('next');
  var askBtn = document.getElementById('askq');
  var qboxBtn = document.getElementById('qbox');
  var sheet = document.getElementById('sheet');
  var qsheet = document.getElementById('qsheet');
  var toastEl = document.getElementById('toast');
  var LOGIN = location.origin + '/login';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }).replace(/K-(VAULT|POP)/g, 'K‑$1').replace(/(\S)·(?=\S)/g, '$1⁠·⁠').replace(/(\d+[년월]) (?=\d+[월일])/g, '$1 ').replace(/(\d[\d,.]*(?:만|천|억)?) (?=(?:원|달러))/g, '$1 '); }
  function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/==(.+?)==/g, '<mark>$1</mark>'); }
  function autolink(s) { return fmt(s).replace(/https?:\/\/[^\s<]+[^\s<.,)]/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>'; }); }
  function arr(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }
  function paras(s) { return String(s || '').split(/\n+/).filter(function (p) { return p.trim() !== ''; }); }
  function mmdd(s) { var m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? (+m[1]) + '/' + (+m[2]) : ''; }

  var ICON = {
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.5v2.5"/></svg>',
    law: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v17"/><path d="M5 7h14"/><path d="M8 20.5h8"/><path d="M5 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/><path d="M19 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/></svg>',
    gate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18h3"/><path d="M9.5 9.5l2 2 3.5-4"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16v10H10l-4.5 3.5v-3.5H4z"/><path d="M8 10.5h8"/></svg>',
    cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="11" height="15" rx="2"/><path d="M5 6.5v12A2.5 2.5 0 0 0 7.5 21H15"/></svg>',
    app: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/><path d="M9.5 8h5v5h-5z"/></svg>',
    coin: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5v1.5M12 16v1.5"/></svg>',
    vault: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#B7791F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
    truck: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.5h11v9H3z"/><path d="M14 9.5h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#0CA678" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/></svg>'
  };

  function token() { var m = /(?:^|;\s*)token=([^;]+)/.exec(document.cookie); return m ? decodeURIComponent(m[1]) : ''; }
  function setToken(t) { var d = new Date(Date.now() + 14 * 864e5); document.cookie = 'token=' + encodeURIComponent(t) + '; path=/; expires=' + d.toUTCString(); }
  var refreshing = null;
  function api(method, path, body, retried) {
    var t = token();
    if (!t || !BOARD) return Promise.resolve({ status: 401, json: null });
    var opt = { method: method, headers: { Accept: 'application/json', Authorization: 'Bearer ' + t } };
    if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(BOARD.api + path, opt).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (r.status === 401 && !retried) {
          refreshing = refreshing || fetch(BOARD.api + '/auth/refresh', { method: 'POST', headers: { Accept: 'application/json', Authorization: 'Bearer ' + t } })
            .then(function (x) { return x.ok ? x.json() : null; })
            .then(function (x) { var nt = x && x.data && x.data.token; if (nt) setToken(nt); return !!nt; }, function () { return false; })
            .then(function (ok) { refreshing = null; return ok; });
          return refreshing.then(function (ok) { return ok ? api(method, path, body, true) : { status: 401, json: j }; });
        }
        return { status: r.status, json: j };
      });
    });
  }

  function b64u(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s); var a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function unseal(blob, key) {
    var raw = b64u(blob);
    return crypto.subtle.importKey('raw', b64u(key), { name: 'AES-GCM' }, false, ['decrypt'])
      .then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, k, raw.slice(12)); })
      .then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
  }

  var toastTimer;
  function toast(s, ms) { toastEl.textContent = s; toastEl.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, ms || 1900); }

  function lockScreen(kind, msg) {
    app.setAttribute('data-tone', 'slate');
    topLabel.innerHTML = esc(RAW.title || '이야기판');
    prevBtn.disabled = true; nextBtn.disabled = true;
    var h = '<div class="lock"><div class="lock-ic">' + ICON.lock + '</div><h2 class="title">' + esc(RAW.lockTitle || '보는 사람이 정해진 이야기예요') + '</h2>';
    if (kind === 'loading') h += '<p class="lock-p">여는 중이에요…</p>';
    else if (kind === 'guest') h += '<p class="lock-p">대시보드에 로그인한 브라우저에서만 열려요. 로그인 창에서 로그인한 뒤 이 화면으로 돌아오면 바로 열려요.</p><div class="btns"><a class="btn primary" href="' + esc(LOGIN) + '" target="_blank" rel="noopener">대시보드 로그인 창 열기</a></div>';
    else if (kind === 'denied') h += '<p class="lock-p">' + esc(msg || '이 이야기는 볼 수 있는 사람이 정해져 있어요.') + '</p>';
    else h += '<p class="lock-p">' + esc(msg || '지금은 열 수 없어요. 잠시 뒤 다시 열어 주세요.') + '</p><div class="btns"><button type="button" class="btn line" id="retry">다시 시도</button></div>';
    stage.innerHTML = '<article class="card">' + h + '</div></article>';
    var rt = document.getElementById('retry');
    if (rt) rt.addEventListener('click', openSealed);
  }
  var sealedTries = 0;
  function openSealed() {
    lockScreen('loading');
    if (!token()) { lockScreen('guest'); return; }
    api('GET', '/story-boards/' + BOARD.key).then(function (r) {
      if (r.status === 200 && r.json && r.json.data && r.json.data.content_key) {
        return unseal(RAW.sealed, r.json.data.content_key).then(function (deck) {
          prevBtn.disabled = false; nextBtn.disabled = false;
          start(deck, r.json.data);
        }, function () { lockScreen('error', '열쇠가 맞지 않아요. 새로 고침해도 같으면 이슈에 알려 주세요.'); });
      }
      if (r.status === 401) lockScreen('guest');
      else if (r.status === 403) lockScreen('denied', r.json && r.json.message);
      else lockScreen('error');
    }, function () { lockScreen('error'); });
  }

  if (RAW.sealed) {
    if (!BOARD || !window.crypto || !crypto.subtle) { lockScreen('error', '이 브라우저에서는 열 수 없어요. 크롬이나 사파리 최신판으로 열어 주세요.'); return; }
    openSealed();
    document.addEventListener('visibilitychange', function () { if (!document.hidden && !app.getAttribute('data-open') && token() && sealedTries++ < 20) openSealed(); });
    return;
  }
  start(RAW, null);

  function start(D, firstBoard) {
    app.setAttribute('data-open', '1');
    var KEY = 'story:' + D.key;

    function castOf(id) { var c = (D.cast || []).filter(function (p) { return p.id === id; })[0]; return c || { id: id, label: '?', name: id, color: '#868E96' }; }
    function av(id) { var c = castOf(id); return '<span class="av" style="background:' + esc(c.color) + '" aria-hidden="true">' + esc(c.label) + '</span>'; }

    var base = [];
    D.chapters.forEach(function (ch, ci) {
      ch.cards.forEach(function (c, k) { base.push({ ci: ci, k: k, n: ch.cards.length, c: c, ref: c.id || ('c' + ci + '-' + k) }); });
    });
    var cards = [], N = 0, firstOf = [], byRef = {};

    function load() {
      var s = null;
      try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
      s = s || {};
      var out = { v: 2, ref: s.ref || null, a: {}, seen: {}, seenAns: s.seenAns || {}, qf: s.qf === 'new' ? 'new' : 'all' };
      if (s.v === 2 || s.ref) { out.a = s.a || {}; out.seen = s.seen || {}; return out; }
      if (typeof s.i === 'number' && base[s.i]) out.ref = base[s.i].ref;
      Object.keys(s.a || {}).forEach(function (i) { if (base[i]) out.a[base[i].ref] = s.a[i]; });
      Object.keys(s.seen || {}).forEach(function (i) { if (base[i]) out.seen[base[i].ref] = 1; });
      return out;
    }
    var S = load();
    var cur = -1;
    function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

    var QA = { on: !!BOARD, status: BOARD ? 'idle' : 'off', me: null, list: [], handoff: null, msg: '', sig: '', loaded: false };
    var LKEY = 'storyq:' + (BOARD ? BOARD.key : D.key);
    function localDrafts() { try { return JSON.parse(localStorage.getItem(LKEY) || '[]') || []; } catch (e) { return []; } }
    function setLocalDrafts(a) { try { if (a.length) localStorage.setItem(LKEY, JSON.stringify(a)); else localStorage.removeItem(LKEY); } catch (e) {} }
    function allQuestions() {
      var out = QA.list.slice();
      localDrafts().forEach(function (d, i) { out.push({ id: 'L' + i, local: true, card_ref: d.ref, card_label: d.label, card_title: d.title, body: d.body, status: 'draft', mine: true }); });
      return out;
    }
    function drafts() { return allQuestions().filter(function (q) { return q.status === 'draft' && q.mine !== false; }); }
    function waiting() { return QA.list.filter(function (q) { return q.status === 'asked'; }); }
    function answered() { return QA.list.filter(function (q) { return q.status === 'answered' && q.answer; }); }
    var openedNew = {}, only = null;
    function isNewAns(q) { var s = S.seenAns[q.id]; return !s || (s !== 1 && !!q.answered_at && s !== q.answered_at); }
    function newAnswers() { return answered().filter(isNewAns); }
    function freshAns(q) { return isNewAns(q) || !!openedNew[q.id]; }
    function onlyPos() { if (!only || cur < 0 || !cards[cur]) return -1; return only.indexOf(cards[cur].ref); }
    function startOnly() {
      var list = cards.filter(function (y) { return y.isAns && isNewAns(y.c.q); });
      if (!list.length) { toast('안 읽은 답이 없어요.'); return; }
      only = list.map(function (y) { return y.ref; });
      closeSheet(); closeQ(); go(list[0].i, 1);
    }
    function markAllRead() { answered().forEach(function (q) { S.seenAns[q.id] = q.answered_at || 1; }); save(); }
    function stalled() { return !!(QA.handoff && ['failed', 'blocked', 'done'].indexOf(QA.handoff.phase) >= 0); }

    function rebuild() {
      var curRef = cur >= 0 && cards[cur] ? cards[cur].ref : null;
      var ans = {}, known = {};
      base.forEach(function (b) { known[b.ref] = 1; });
      var orphans = [];
      answered().forEach(function (q) { if (known[q.card_ref]) (ans[q.card_ref] = ans[q.card_ref] || []).push(q); else orphans.push(q); });
      cards = []; byRef = {};
      function push(x) { x.i = cards.length; cards.push(x); byRef[x.ref] = x.i; }
      function answersAfter(b, list) { list.forEach(function (q) { push({ ci: b.ci, k: b.k, n: b.n, c: { type: 'answer', q: q }, ref: 'a' + q.id, anchor: b.ref, isAns: true }); }); }
      base.forEach(function (b, j) {
        if (j === base.length - 1 && orphans.length) answersAfter(base[j - 1] || b, orphans);
        push(b);
        answersAfter(b, ans[b.ref] || []);
      });
      N = cards.length;
      firstOf = D.chapters.map(function (ch, ci) { for (var j = 0; j < N; j++) if (cards[j].ci === ci) return j; return 0; });
      if (curRef != null && byRef[curRef] != null) cur = byRef[curRef];
    }
    rebuild();

    function anchorOf(x) { return x.anchor || x.ref; }
    function labelOf(x) { var ch = D.chapters[x.ci]; return (ch.no ? ch.no + ' · ' : '') + (x.k + 1) + '/' + x.n; }
    function titleOf(x) { var c = x.c; return String(c.title || c.q || c.eyebrow || D.chapters[x.ci].title || '').replace(/\*\*|==/g, '').slice(0, 280); }

    function pc(p) {
      return '<div class="pc' + (p.q ? ' q' : '') + (p.small ? ' small' : '') + '"><span class="pc-g">' + esc(p.group || '') + '</span>' + (p.q ? '<span class="pc-q">?</span>' : SIL) + '<span class="pc-m">' + esc(p.q ? '무작위' : (p.member || '')) + '</span>' + (p.label ? '<span class="pc-l">' + esc(p.label) + '</span>' : '') + (p.badge ? '<span class="pc-b' + (p.warn ? ' warn' : '') + '">' + esc(p.badge) + '</span>' : '') + '</div>';
    }
    var SIL = '<svg class="pc-s" viewBox="0 0 60 70" aria-hidden="true"><circle cx="30" cy="24" r="13"/><path d="M5 70c0-15 11-25 25-25s25 10 25 25z"/></svg>';

    var PIC = {
      img: function (p) { return '<figure class="pic p-img' + (p.wide ? ' wide' : '') + '"><img src="' + esc(p.src) + '" alt="' + esc(p.alt || '') + '" loading="lazy">' + (p.cap ? '<figcaption>' + fmt(p.cap) + '</figcaption>' : '') + '</figure>'; },
      notify: function (p) { return '<div class="pic p-notify"><div class="n-app"><i></i>' + esc(p.app) + '</div><div class="n-title">' + fmt(p.title) + '</div><div class="n-body">' + fmt(p.body) + '</div>' + (p.from ? '<div class="n-from">' + fmt(p.from) + '</div>' : '') + '</div>'; },
      quote: function (p) { return '<blockquote class="pic p-quote"><span class="qm" aria-hidden="true">“</span><p>' + fmt(p.text) + '</p>' + (p.cite ? '<cite>' + esc(p.cite) + '</cite>' : '') + '</blockquote>'; },
      doors: function (p) {
        var h = '<div class="pic p-doors' + (p.mini ? ' mini' : '') + '">';
        p.items.forEach(function (d, k) {
          var cls = 'door';
          if (p.hl != null) cls += (arr(p.hl).indexOf(k) >= 0 ? ' on' : ' off');
          h += '<div class="' + cls + '"><div class="arch">' + (d.tag ? '<em>' + esc(d.tag) + '</em>' : '') + '</div><b>' + esc(d.name) + '</b>' + (d.sub ? '<small>' + esc(d.sub) + '</small>' : '') + '</div>';
        });
        return h + '</div>';
      },
      flow: function (p) {
        var h = '<div class="pic p-flow">';
        p.rows.forEach(function (r) {
          h += '<div class="fl"><span class="kind' + (r.kind === 'money' ? ' money' : '') + '">' + esc(r.kind === 'money' ? '돈' : '물건') + '</span><span class="who">' + esc(r.from) + '</span><span class="ar">' + (r.what ? '<em>' + esc(r.what) + '</em>' : '') + '</span>';
          if (r.via) h += '<span class="who via">' + esc(r.via) + '</span><span class="ar">' + (r.what2 ? '<em>' + esc(r.what2) + '</em>' : '') + '</span>';
          h += '<span class="who">' + esc(r.to) + '</span></div>';
        });
        return h + '</div>';
      },
      route: function (p) {
        var on = arr(p.on);
        var lo = on.length ? Math.min.apply(null, on) : -1;
        var h = '<div class="pic p-route"><div class="ends"><span>' + esc(p.from) + '</span><span>' + esc(p.to) + '</span></div><ol style="--n:' + p.steps.length + '">';
        p.steps.forEach(function (s, k) {
          var cls = on.indexOf(k) >= 0 ? 'on' : (k < lo ? 'done' : '');
          h += '<li class="' + cls + '"><i>' + (k + 1) + '</i><span>' + esc(s) + '</span></li>';
        });
        return h + '</ol></div>';
      },
      money: function (p) {
        function box(b) {
          var ic = b.kind === 'vault' ? ICON.vault : (b.kind === 'good' ? ICON.check : (b.kind === 'ship' ? ICON.truck : ICON.coin));
          return '<div class="m-box ' + esc(b.kind || '') + '">' + ic + '<div>' + esc(b.label) + (b.sub ? '<small>' + esc(b.sub) + '</small>' : '') + '</div><span class="amt">' + esc(b.amount) + '</span></div>';
        }
        var h = '<div class="pic p-money">' + box(p.top) + '<div class="m-down" aria-hidden="true">↓</div><div class="m-split' + (p.eq ? ' eq' : '') + (p.stack ? ' stack' : '') + '">';
        p.split.forEach(function (b) { h += box(b); });
        h += '</div>' + (p.foot ? '<div class="m-foot">' + fmt(p.foot) + '</div>' : '') + '</div>';
        return h;
      },
      fork: function (p) { return '<div class="pic p-fork"><div class="f-top">' + esc(p.top) + '</div><div class="f-br"><div class="f-b ok"><b>' + esc(p.ok[0]) + '</b>' + fmt(p.ok[1]) + '</div><div class="f-b no"><b>' + esc(p.no[0]) + '</b>' + fmt(p.no[1]) + '</div></div></div>'; },
      traps: function (p) {
        var h = '<div class="pic p-traps">';
        p.items.forEach(function (t) { h += '<div class="trap' + (t.small ? ' small' : '') + '">' + (ICON[t.icon] || '') + '<b>' + esc(t.name) + '</b></div>'; });
        return h + '</div>';
      },
      trap: function (p) { return '<div class="pic p-trap"><span class="ic">' + (ICON[p.icon] || '') + '</span><div><b>' + esc(p.name) + '</b><small>' + fmt(p.sub) + '</small></div></div>'; },
      chat: function (p) { return '<div class="pic p-chat"><div class="c-head"><span class="lb">LINE</span>' + esc(p.from) + '</div><div class="c-b">' + esc(p.text) + (p.ko ? '<small>' + fmt(p.ko) + '</small>' : '') + '</div></div>'; },
      msgr: function (p) { return '<div class="pic p-msgr"><div class="tw"><b>' + esc(p.tw[0]) + '</b>' + fmt(p.tw[1]) + '</div><div class="kr"><b>' + esc(p.kr[0]) + '</b>' + fmt(p.kr[1]) + '</div></div>'; },
      blocks: function (p) {
        var h = '<div class="pic p-blocks">';
        p.stages.forEach(function (s, k) {
          if (k) h += '<div class="b-plus" aria-hidden="true">+</div>';
          h += '<div class="b-stage"><div class="b-stack">';
          s.blocks.forEach(function (b) { h += '<span>' + esc(b) + '</span>'; });
          h += '</div><b>' + esc(s.name) + '</b><small>' + esc(s.sub || '') + '</small></div>';
        });
        return h + (p.total ? '<div class="b-total">' + fmt(p.total) + '</div>' : '') + '</div>';
      },
      pay: function (p) {
        var h = '<div class="pic p-pay"><div class="pay-bar">';
        p.parts.forEach(function (x) { h += '<span style="flex:' + x.pct + '">' + x.pct + '%</span>'; });
        h += '</div><div class="pay-lab">';
        p.parts.forEach(function (x) { h += '<div style="flex:' + x.pct + '"><b>' + esc(x.amount) + '</b>' + esc(x.when) + '</div>'; });
        return h + '</div></div>';
      },
      phrases: function (p) { return '<div class="pic p-phr">' + p.items.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>'; },
      checks: function (p) { return '<div class="pic p-checks">' + p.items.map(function (x, k) { return '<div><i>' + (k + 1) + '</i>' + fmt(x) + '</div>'; }).join('') + '</div>'; },
      price: function (p) { return '<div class="pic p-price">' + p.rows.map(function (r) { return '<div class="' + (r.on ? 'on' : 'off') + '"><b>' + esc(r.name) + '</b><span>' + fmt(r.note) + '</span></div>'; }).join('') + '</div>'; },
      house: function (p) {
        return '<div class="pic p-house"><div class="roof">' + esc(p.roof) + '</div>' + PIC.doors({ items: p.doors, mini: true }) + '<div class="shared">' + p.shared.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div></div>';
      },
      weeks: function (p) { return '<div class="pic p-weeks">' + p.rows.map(function (r) { return '<div class="wk"><b>' + esc(r[0]) + '</b><span>' + fmt(r[1]) + (r[2] ? '<em>' + esc(r[2]) + '</em>' : '') + '</span></div>'; }).join('') + '</div>'; },
      chips: function (p) { return '<div class="pic p-chips">' + (p.count ? '<span class="cnt">' + esc(p.count) + '</span>' : '') + p.items.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>'; },
      vs: function (p) {
        function side(x, cls) { var v = x[1]; return '<div class="' + cls + '"><b>' + esc(x[0]) + '</b>' + (Array.isArray(v) ? '<ul>' + v.map(function (l) { return '<li>' + fmt(l) + '</li>'; }).join('') + '</ul>' : fmt(v)) + '</div>'; }
        return '<div class="pic p-vs">' + side(p.a, 'a') + side(p.b, 'b') + '</div>';
      },
      pcard: function (p) { return '<div class="pic p-pcard">' + pc(p) + (p.cap ? '<div class="cap">' + fmt(p.cap) + '</div>' : '') + '</div>'; },
      album: function (p) {
        return '<div class="pic p-album"><div class="alb-row"><div class="alb"><span>ALBUM</span><b>' + esc(p.title) + '</b><i>' + esc(p.inside) + '</i></div><div class="alb-ar" aria-hidden="true">→</div>' + pc({ group: p.group, q: true }) + '</div><div class="alb-mem">' + p.members.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '<em>' + esc(p.memo) + '</em></div></div>';
      },
      search: function (p) {
        var pts = p.spark, mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts), W = 120, H = 34;
        var d = pts.map(function (v, k) { return (k ? 'L' : 'M') + (k * W / (pts.length - 1)).toFixed(1) + ' ' + (H - 3 - (v - mn) / (mx - mn || 1) * (H - 6)).toFixed(1); }).join(' ');
        return '<div class="pic p-search"><div class="sr-chips">' + p.filters.map(function (f) { return '<span>' + esc(f) + '</span>'; }).join('<i>›</i>') + '</div><div class="sr-count">' + fmt(p.count) + '</div><div class="sr-card">' + pc({ group: p.group, member: p.member, label: p.label, small: true }) + '<div class="sr-info"><b>' + esc(p.name) + '</b><svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg><div class="sr-px"><span>지금 사면 <b>' + esc(p.buy) + '</b></span><span>지금 팔면 <b>' + esc(p.sell) + '</b></span></div></div></div></div>';
      },
      scan: function (p) {
        return '<div class="pic p-scan"><div class="sc-label"><div class="sc-bar" aria-hidden="true"></div><span>' + esc(p.code) + '</span></div><div class="sc-ok">' + ICON.check + '<b>' + esc(p.status) + '</b></div>' + p.notes.map(function (n) { return '<div class="sc-note"><span class="sc-to">' + esc(n[0]) + '</span>' + esc(n[1]) + (n[2] ? '<small>' + fmt(n[2]) + '</small>' : '') + '</div>'; }).join('') + '</div>';
      },
      steps: function (p) { return '<ol class="pic p-steps">' + p.items.map(function (x) { return '<li><b>' + esc(x[0]) + '</b><span>' + fmt(x[1]) + '</span></li>'; }).join('') + '</ol>'; }
    };

    function pics(c) {
      var list = arr(c.pic);
      if (!list.length) return '';
      var h = list.map(function (p) { return (PIC[p.type] || function () { return ''; })(p); }).join('');
      return list.length > 1 ? '<div class="pics">' + h + '</div>' : h;
    }
    function boxes(c) {
      var h = '';
      if (c.remember) h += '<div class="box remember"><span class="lab">기억</span>' + fmt(c.remember) + '</div>';
      if (c.tip) h += '<div class="box tip"><span class="lab">요령</span>' + fmt(c.tip) + '</div>';
      if (c.ban) h += '<div class="box ban"><span class="lab">이 말은 금지</span>' + fmt(c.ban) + '</div>';
      if (c.teaser) h += '<div class="teaser">' + fmt(c.teaser) + '</div>';
      if (c.buttons) h += btns(c.buttons);
      if (c.links) h += links(c.links);
      if (c.note) h += '<div class="note">' + fmt(c.note) + '</div>';
      if (c.more) h += '<button type="button" class="more" data-more="1">' + esc(c.more.label || '근거 보기') + '</button><div class="morebox" hidden>' + arr(c.more.lines).map(function (l) { return '<div>' + linkify(l) + '</div>'; }).join('') + '</div>';
      return h;
    }
    function linkify(l) {
      if (typeof l === 'string') return fmt(l);
      return fmt(l.text || '') + ' <a href="' + esc(l.href) + '" target="_blank" rel="noopener">' + esc(l.link || '열기') + '</a>';
    }
    function links(list) {
      return '<div class="links">' + list.map(function (b) { return '<a href="' + esc(b.href) + '" target="_blank" rel="noopener">' + esc(b.label) + '<span aria-hidden="true">↗</span></a>'; }).join('') + '</div>';
    }
    function btns(list) {
      return '<div class="btns">' + list.map(function (b) {
        if (b.copy) return '<button type="button" class="btn ' + (b.primary ? 'primary' : 'line') + '" data-copy="' + esc(b.copy) + '">' + esc(b.label) + '</button>';
        if (b.go != null) return '<button type="button" class="btn ' + (b.primary ? 'primary' : 'line') + '" data-goto="' + (base[b.go] ? byRef[base[b.go].ref] : 0) + '">' + esc(b.label) + '</button>';
        return '<a class="btn ' + (b.primary ? 'primary' : 'line') + '" href="' + esc(b.href) + '" target="_blank" rel="noopener">' + esc(b.label) + ' <span class="ar" aria-hidden="true">↗</span></a>';
      }).join('') + '</div>';
    }
    function head(x) {
      var ch = D.chapters[x.ci];
      if (x.k === 0 && ch.no) return '<div class="chhead"><span class="no">' + esc(ch.no) + '</span><div><b>' + esc(ch.title) + '</b><small>' + esc(ch.lead || '') + '</small></div></div>';
      return '';
    }
    function body(c) {
      var b = arr(c.body);
      return b.length ? '<div class="body">' + b.map(function (p) { return '<p>' + fmt(p) + '</p>'; }).join('') + '</div>' : '';
    }
    function title(c) { return c.title ? '<h2 class="title">' + fmt(c.title) + '</h2>' : ''; }
    function kicker(c) { return c.kicker ? '<div class="kicker">' + esc(c.kicker) + '</div>' : ''; }

    function qaBanner(where) {
      if (!QA.on) return '';
      var h = '';
      var news = newAnswers();
      if (news.length) h += '<div class="qa-ban new"><b>안 읽은 답 ' + news.length + '개</b><button type="button" data-only="1">안 읽은 답만 보기</button></div>';
      var w = waiting();
      if (w.length && stalled()) h += '<div class="qa-ban wait"><b>질문 ' + w.length + '개에 아직 답이 없어요</b><button type="button" data-inbox="1">다시 보내기</button></div>';
      else if (w.length) h += '<div class="qa-ban wait"><b>질문 ' + w.length + '개에 AI가 답하는 중</b><span>' + esc(QA.handoff && QA.handoff.label || '곧 시작') + '</span></div>';
      var d = drafts();
      if (d.length) h += '<div class="qa-ban"><b>모아 둔 질문 ' + d.length + '개</b><button type="button" data-inbox="1">' + (where === 'end' ? '지금 물어보기' : '질문함 열기') + '</button></div>';
      return h;
    }
    function qaHint() {
      if (!QA.on || QA.list.length || drafts().length) return '';
      return '<div class="qa-hint">궁금한 장에서 아래 <b>질문</b>을 눌러 모아 두고, 다 읽은 뒤 <b>물어보기</b>를 누르면 AI가 한 번에 답해요.</div>';
    }

    var R = {
      scene: function (c, x) { return head(x) + kicker(c) + title(c) + pics(c) + body(c) + boxes(c); },
      talk: function (c, x) {
        var h = head(x) + kicker(c) + title(c) + '<div class="talk">';
        c.lines.forEach(function (l) {
          var me = l.who === 'me';
          var p = castOf(l.who);
          h += '<div class="say ' + (me ? 'me' : 'them') + '">' + av(l.who) + '<div class="bubble"><span class="who">' + esc(l.label || p.name) + '</span>' + fmt(l.text) + '</div></div>';
        });
        return h + '</div>' + body(c) + boxes(c);
      },
      list: function (c, x) {
        var h = head(x) + kicker(c) + title(c) + '<ul class="list' + (c.style ? ' ' + esc(c.style) : '') + '">';
        c.items.forEach(function (it, k) {
          var main = Array.isArray(it) ? it[0] : it;
          var sub = Array.isArray(it) ? it[1] : '';
          h += '<li><span class="n">' + (c.style === 'ban' ? '✕' : (k + 1)) + '</span><div><b>' + fmt(main) + '</b>' + (sub ? '<small>' + fmt(sub) + '</small>' : '') + '</div></li>';
        });
        return h + '</ul>' + body(c) + boxes(c);
      },
      quiz: function (c, x) {
        var a = S.a[x.ref];
        var ch = D.chapters[x.ci];
        var h = head(x) + '<div class="qhead">' + esc(c.label || ((ch.no ? ch.no + ' 끝' : '확인') + ' · 한 문제')) + '</div><h2 class="q">' + fmt(c.q) + '</h2><div class="opts">';
        c.options.forEach(function (o, k) {
          var cls = 'opt';
          if (a != null) cls += k === c.answer ? ' right' : (k === a ? ' wrong' : ' dim');
          h += '<button type="button" class="' + cls + '" data-opt="' + k + '"' + (a != null ? ' aria-pressed="' + (k === a) + '"' : '') + '><span class="ok">' + 'ABCD'.charAt(k) + '</span><span>' + fmt(o) + '</span></button>';
        });
        h += '</div>';
        if (a != null) h += '<div class="why">' + (a === c.answer ? '<b class="g">맞았어요.</b> ' : '<b class="r">정답은 ' + 'ABCD'.charAt(c.answer) + '예요.</b> ') + fmt(c.why) + '</div>';
        else h += '<div class="note">고르면 바로 정답과 이유가 나와요. 몰라도 괜찮아요.</div>';
        return h;
      },
      numbers: function (c, x) {
        return head(x) + kicker(c) + title(c) + '<div class="nums">' + c.items.map(function (n) { return '<div><b>' + esc(n[0]) + '</b><small>' + fmt(n[1]) + '</small></div>'; }).join('') + '</div>' + body(c) + boxes(c);
      },
      spine: function (c, x) {
        return head(x) + kicker(c) + title(c) + '<ol class="spine">' + c.items.map(function (n) { return '<li><b>' + esc(n[0]) + '</b>' + fmt(n[1]) + '</li>'; }).join('') + '</ol>' + body(c) + boxes(c);
      },
      decide: function (c, x) {
        var h = head(x) + kicker(c) + title(c) + '<div class="decide">';
        c.items.forEach(function (d, k) {
          h += '<div class="dec"><b>' + (k + 1) + '. ' + fmt(d.q) + '</b><div class="opts2">' + fmt(d.options) + '</div><div class="rec"><em>권고 ' + esc(d.rec) + '</em> — ' + fmt(d.why) + '</div></div>';
        });
        return h + '</div>' + body(c) + boxes(c);
      },
      cast: function (c, x) {
        var h = head(x) + kicker(c) + title(c) + '<div class="cast">';
        c.ids.forEach(function (id) { var p = castOf(id); h += '<div>' + av(id) + '<div><b>' + esc(p.name) + '</b><small>' + fmt(p.role || '') + '</small></div></div>'; });
        return h + '</div>' + body(c) + boxes(c);
      },
      start: function (c, x) {
        var h = '<div class="start-hero">' + (D.internal ? '<span class="internal">' + esc(D.internal) + '</span>' : '') + '<div class="eyebrow">' + esc(c.eyebrow || '') + '</div><h1>' + fmt(c.title) + '</h1>' + arr(c.body).map(function (p) { return '<p>' + fmt(p) + '</p>'; }).join('') + '</div>';
        if (c.meta) h += '<div class="meta">' + c.meta.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</div>';
        h += qaBanner('start');
        var ri = S.ref != null ? byRef[S.ref] : null;
        if (ri != null && ri > 1) {
          var y = cards[ri];
          var ch = D.chapters[y.ci];
          h += '<div class="btns"><button type="button" class="btn primary" data-goto="' + ri + '">이어 보기 · ' + esc((ch.no ? ch.no + ' ' : '') + (y.k + 1) + '/' + y.n) + '</button><button type="button" class="btn line" data-goto="' + (base[1] ? byRef[base[1].ref] : 1) + '">처음부터</button></div>';
        }
        h += '<div class="start-toc' + (ri != null && ri > 1 ? ' has-resume' : '') + '">' + D.chapters.map(function (ch, ci) {
          if (!ch.no) return '';
          return '<button type="button" data-goto="' + firstOf[ci] + '" data-tone="' + esc(ch.tone) + '"><span class="tno" style="background:var(--tone)">' + esc(ch.no) + '</span><span class="tt">' + esc(ch.title) + '</span>' + (chapterDone(ci) ? '<span class="st">읽음</span>' : '') + '</button>';
        }).join('') + '</div>';
        return h + qaHint() + boxes(c);
      },
      end: function (c, x) {
        var qs = base.filter(function (y) { return y.c.type === 'quiz'; });
        var right = qs.filter(function (y) { return S.a[y.ref] === y.c.answer; }).length;
        var done = qs.filter(function (y) { return S.a[y.ref] != null; }).length;
        var redo = qs.filter(function (y) { return S.a[y.ref] == null || S.a[y.ref] !== y.c.answer; });
        var qb = qaBanner('end');
        var h = head(x) + kicker(c) + title(c) + qb;
        h += '<div class="score' + (qb ? ' sm' : '') + '"><b>' + right + ' / ' + qs.length + '</b><span>' + (done < qs.length ? '문제 맞힘 · 안 푼 문제 ' + (qs.length - done) + '개' : '문제 맞힘') + '</span></div>';
        var many = redo.length > 4 || (qb && redo.length > 1);
        if (redo.length && done > 0) h += '<div class="redo' + (many ? ' one' : '') + '">' + (many ? '<span class="redo-lab">다시 볼 장</span>' : '') + redo.map(function (y) { var ch = D.chapters[y.ci]; return '<button type="button" data-goto="' + firstOf[y.ci] + '">' + esc(ch.no) + (many ? '' : ' 다시 보기') + '</button>'; }).join('') + '</div>';
        return h + body(c) + boxes(c);
      },
      answer: function (c, x) {
        var q = c.q;
        var who = q.mine === false && q.asked_by ? q.asked_by.name + ' 님이 물어본 것' : '물어본 것';
        var h = '<div class="ans-tags"><span class="ans-tag">' + esc(who) + (q.answered_at ? ' · ' + esc(mmdd(q.answered_at)) + ' 답' : '') + '</span>' + (freshAns(q) ? '<span class="ans-new">새 답</span>' : '<span class="ans-read">읽음</span>') + '</div>';
        h += '<div class="ans-q"><span class="qm" aria-hidden="true">Q</span><div><p>' + esc(q.body) + '</p><small>' + esc(labelOf(cards[byRef[x.anchor]] || x)) + ' 장에서</small></div></div>';
        h += '<div class="ans-a">' + paras(q.answer).map(function (p) { return '<p>' + fmt(p) + '</p>'; }).join('') + '</div>';
        if (q.fixed) h += '<div class="box remember"><span class="lab">고친 장</span>이 답에 맞춰 바로 앞 장을 고쳤어요.</div>';
        if (q.answer_more) h += '<button type="button" class="more" data-more="1">근거 보기</button><div class="morebox" hidden>' + paras(q.answer_more).map(function (l) { return '<div>' + autolink(l) + '</div>'; }).join('') + '</div>';
        return h;
      }
    };

    function chapterDone(ci) {
      for (var j = 0; j < base.length; j++) if (base[j].ci === ci && !S.seen[base[j].ref]) return false;
      return true;
    }

    function renderCard(x) {
      var c = x.c;
      var fn = R[c.type || 'scene'] || R.scene;
      return fn(c, x);
    }

    function paintTop(x) {
      var ch = D.chapters[x.ci];
      app.setAttribute('data-tone', ch.tone || 'blue');
      var segs = '';
      D.chapters.forEach(function (c2, ci) {
        if (!c2.no && !c2.bar) return;
        var w = ci < x.ci ? 100 : (ci === x.ci ? Math.round((x.k + 1) / x.n * 100) : 0);
        segs += '<span><i style="width:' + w + '%"></i></span>';
      });
      bars.innerHTML = segs;
      topLabel.innerHTML = esc(ch.no ? ch.no + ' · ' + ch.title : ch.title) + '<small>' + (x.isAns ? '물어본 것의 답' : (x.k + 1) + ' / ' + x.n) + '</small>';
      prevBtn.disabled = x.i === 0;
      var nc = cards[x.i + 1];
      if (!nc) { nextBtn.textContent = D.lastLabel || '처음으로'; nextBtn.className = 'next soft'; }
      else if (x.c.type === 'start') { nextBtn.textContent = '이야기 시작'; nextBtn.className = 'next'; }
      else if (nc.isAns) { nextBtn.textContent = '답 보기'; nextBtn.className = 'next ans'; }
      else if (nc.ci !== x.ci && D.chapters[nc.ci].no) { nextBtn.textContent = D.chapters[nc.ci].no + '으로'; nextBtn.className = 'next'; }
      else if (x.c.type === 'quiz' && S.a[x.ref] == null) { nextBtn.textContent = '건너뛰기'; nextBtn.className = 'next soft'; }
      else { nextBtn.textContent = '다음'; nextBtn.className = 'next'; }
      var op = onlyPos();
      if (op >= 0) {
        topLabel.innerHTML = esc(ch.no ? ch.no + ' · ' + ch.title : ch.title) + '<small>안 읽은 답만 보는 중 · ' + (op + 1) + ' / ' + only.length + '</small>';
        prevBtn.disabled = op === 0;
        nextBtn.textContent = op < only.length - 1 ? '다음 안 읽은 답' : '다 읽었어요';
        nextBtn.className = 'next ans';
      }
      paintQ();
    }

    function bind(root, x) {
      root.querySelectorAll('[data-opt]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (S.a[x.ref] != null) return;
          S.a[x.ref] = +b.getAttribute('data-opt');
          save();
          if (allMode) { root.innerHTML = renderCard(x); bind(root, x); return; }
          go(x.i, 0, true);
        });
      });
      root.querySelectorAll('[data-goto]').forEach(function (b) {
        b.addEventListener('click', function () { closeSheet(); closeQ(); only = null; go(+b.getAttribute('data-goto'), 1); });
      });
      root.querySelectorAll('[data-only]').forEach(function (b) {
        b.addEventListener('click', function () { startOnly(); });
      });
      root.querySelectorAll('[data-allread]').forEach(function (b) {
        b.addEventListener('click', function () { markAllRead(); toast('모두 읽음으로 바꿨어요.'); if (qview === 'inbox') openInbox(); paintQ(); });
      });
      root.querySelectorAll('[data-qf]').forEach(function (b) {
        b.addEventListener('click', function () { S.qf = b.getAttribute('data-qf'); save(); openInbox(); });
      });
      root.querySelectorAll('[data-more]').forEach(function (b) {
        var label = (x.c.more && x.c.more.label) || '근거 보기';
        b.addEventListener('click', function () { var m = b.nextElementSibling; m.hidden = !m.hidden; b.textContent = m.hidden ? label : '접기'; });
      });
      root.querySelectorAll('[data-copy]').forEach(function (b) {
        b.addEventListener('click', function () { copyText((D.copies || {})[b.getAttribute('data-copy')] || ''); });
      });
      root.querySelectorAll('[data-inbox]').forEach(function (b) {
        b.addEventListener('click', function () { openInbox(); });
      });
    }

    function copyText(s) {
      function ok() { toast('복사했어요. 메일 본문에 붙여 넣으세요.'); }
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(s).then(ok, fallback); } else fallback();
      function fallback() {
        var t = document.createElement('textarea');
        t.value = s; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); ok(); } catch (e) { toast('복사가 안 돼요. 길게 눌러 복사해 주세요.'); }
        t.remove();
      }
    }

    function go(i, dir, stay) {
      if (i < 0 || i >= N) return;
      var x = cards[i];
      var el = document.createElement('article');
      el.className = 'card' + (x.isAns ? ' is-answer' : '') + (stay ? '' : (dir > 0 ? ' in-next' : (dir < 0 ? ' in-prev' : '')));
      el.setAttribute('aria-live', 'polite');
      if (x.isAns && isNewAns(x.c.q)) openedNew[x.c.q.id] = 1;
      if (only && only.indexOf(x.ref) < 0) only = null;
      el.innerHTML = renderCard(x);
      var keepScroll = stay ? stage.scrollTop : 0;
      stage.innerHTML = '';
      stage.appendChild(el);
      stage.scrollTop = keepScroll;
      bind(el, x);
      el.querySelectorAll('img').forEach(function (im) { im.addEventListener('load', hintCheck); });
      cur = i;
      if (x.isAns) S.seenAns[x.c.q.id] = x.c.q.answered_at || 1; else S.seen[x.ref] = 1;
      if (i > 0) S.ref = x.ref;
      save();
      paintTop(x);
      hintCheck();
      if (history.replaceState && !allMode) history.replaceState(null, '', '#p=' + (i + 1));
    }
    function repaint() { if (allMode) { renderAll(); return; } if (cur >= 0) go(cur, 0, true); }

    var hint = document.getElementById('morehint');
    var navEl = document.querySelector('.nav');
    function hintCheck() {
      if (allMode) { hint.classList.remove('on'); return; }
      hint.style.bottom = (navEl.offsetHeight + 10) + 'px';
      var more = stage.scrollHeight - stage.clientHeight - stage.scrollTop > 12;
      hint.classList.toggle('on', more);
    }
    stage.addEventListener('scroll', hintCheck, { passive: true });
    window.addEventListener('resize', hintCheck);
    hint.addEventListener('click', function () { stage.scrollBy({ top: Math.round(stage.clientHeight * 0.7), behavior: 'smooth' }); });

    function next() {
      var op = onlyPos();
      if (op >= 0) {
        if (op < only.length - 1 && byRef[only[op + 1]] != null) { go(byRef[only[op + 1]], 1); return; }
        only = null; paintTop(cards[cur]); toast('안 읽은 답을 다 읽었어요. 이제 다음을 누르면 이야기로 이어져요.', 2600); return;
      }
      if (cur < N - 1) go(cur + 1, 1); else go(0, -1);
    }
    function prev() {
      var op = onlyPos();
      if (op >= 0) { if (op > 0 && byRef[only[op - 1]] != null) go(byRef[only[op - 1]], -1); return; }
      if (cur > 0) go(cur - 1, -1);
    }
    nextBtn.addEventListener('click', next);
    prevBtn.addEventListener('click', prev);

    document.addEventListener('keydown', function (e) {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (!qsheet.hidden) { if (e.key === 'Escape') closeQ(); return; }
      if (!sheet.hidden) { if (e.key === 'Escape') closeSheet(); return; }
      if (allMode) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    });

    var tx = null, ty = null, tt = 0;
    stage.addEventListener('touchstart', function (e) { if (e.touches.length !== 1) return; tx = e.touches[0].clientX; ty = e.touches[0].clientY; tt = Date.now(); }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (tx == null || allMode) return;
      var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
      tx = null;
      if (Date.now() - tt > 700) return;
      if (Math.abs(dx) > 64 && Math.abs(dy) < 44) { if (dx < 0) next(); else prev(); }
    }, { passive: true });

    function openSheet() {
      var h = '<ol class="toc">' + D.chapters.map(function (ch, ci) {
        var isCur = cur >= 0 && cards[cur].ci === ci;
        return '<li class="' + (isCur ? 'cur' : '') + '"><button type="button" data-goto="' + firstOf[ci] + '" data-tone="' + esc(ch.tone) + '"><span class="tno" style="background:var(--tone)">' + esc(ch.no || '•') + '</span><span class="tt">' + esc(ch.title) + '</span><span class="tm">' + esc(ch.min || '') + '</span>' + (chapterDone(ci) ? '<span class="st">읽음</span>' : '') + '</button></li>';
      }).join('') + '</ol>';
      document.getElementById('tocbox').innerHTML = h;
      bind(document.getElementById('tocbox'), cards[Math.max(cur, 0)]);
      sheet.hidden = false;
    }
    function closeSheet() { sheet.hidden = true; }
    document.getElementById('menu').addEventListener('click', openSheet);
    document.getElementById('closesheet').addEventListener('click', closeSheet);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
    document.getElementById('restart').addEventListener('click', function () { closeSheet(); go(1, 1); });

    var qin = qsheet.querySelector('.qs');
    var qview = null;
    function closeQ() { qsheet.hidden = true; qview = null; }
    qsheet.addEventListener('click', function (e) { if (e.target === qsheet) closeQ(); });

    function chip(q) {
      var t = q.status === 'answered' ? (isNewAns(q) ? '새 답' : '읽음') : (q.status === 'asked' ? '답 기다리는 중' : (q.local ? '이 기기에만 모아 둠' : '모아 둠'));
      return '<span class="st-chip st-' + esc(q.status) + (q.status === 'answered' ? (isNewAns(q) ? ' st-new' : ' st-read') : '') + '">' + t + '</span>';
    }
    function item(q, opts) {
      var h = '<div class="qi ' + esc(q.status) + (q.status === 'answered' && !isNewAns(q) ? ' read' : '') + '" data-qid="' + esc(q.id) + '">';
      if (opts.where) h += '<span class="qi-where">' + esc(q.card_label || '') + (q.card_title ? ' · ' + esc(q.card_title) : '') + '</span>';
      h += '<div class="qi-b">' + esc(q.body) + chip(q) + (q.mine === false && q.asked_by ? '<span class="qi-who">' + esc(q.asked_by.name) + '</span>' : '') + '</div>';
      if (q.status === 'answered' && q.answer) h += '<div class="qi-a">' + fmt(paras(q.answer)[0] || '') + '</div>';
      var act = '';
      if (q.status === 'answered' && byRef['a' + q.id] != null) act += '<button type="button" data-goto="' + byRef['a' + q.id] + '">답 보기</button>';
      else if (opts.where && byRef[q.card_ref] != null) act += '<button type="button" data-goto="' + byRef[q.card_ref] + '">그 장 보기</button>';
      if (q.mine !== false && q.status === 'draft') act += '<button type="button" data-edit="' + esc(q.id) + '">고치기</button><button type="button" data-del="' + esc(q.id) + '">지우기</button>';
      else if (q.mine !== false && q.status === 'asked' && stalled()) act += '<button type="button" data-del="' + esc(q.id) + '">지우기</button>';
      if (act) h += '<div class="qi-act">' + act + '</div>';
      return h + '</div>';
    }
    function statusNote() {
      if (QA.status === 'guest') return '<div class="qs-note warn">대시보드에 로그인하지 않은 브라우저라 질문이 <b>이 기기에만</b> 모여요. <a href="' + esc(LOGIN) + '" target="_blank" rel="noopener">대시보드 로그인 창 열기</a> — 로그인하고 돌아오면 서버로 옮겨지고 물어볼 수 있어요.</div>';
      if (QA.status === 'error') return '<div class="qs-note warn">지금 서버에 연결이 안 돼서 질문을 이 기기에 모아 둬요. 연결되면 저절로 옮겨져요.</div>';
      if (QA.status === 'denied') return '<div class="qs-note warn">' + esc(QA.msg || '이 판의 질문함은 쓸 수 없는 계정이에요.') + '</div>';
      return '';
    }

    function openCardQ() {
      if (cur < 0) return;
      var x = cards[cur];
      var anchor = cards[byRef[anchorOf(x)]] || x;
      qview = 'card';
      var mine = allQuestions().filter(function (q) { return q.card_ref === anchor.ref; });
      var h = '<div class="sh-head"><b>이 장에 질문</b><button type="button" data-close="1">닫기</button></div>';
      h += '<div class="qs-ctx">' + esc(labelOf(anchor)) + (titleOf(anchor) ? ' · ' + esc(titleOf(anchor)) : '') + '</div>';
      if (mine.length) h += mine.map(function (q) { return item(q, {}); }).join('');
      h += '<textarea id="qtext" rows="3" maxlength="2000" placeholder="궁금한 것을 적어 두세요. 다 읽고 한 번에 물어볼 수 있어요."></textarea>';
      h += '<div class="btns"><button type="button" class="btn primary qa" id="qsave">모아 두기</button></div>';
      var d = drafts().length;
      h += '<div class="qs-foot">' + (d ? '모아 둔 질문 ' + d + '개 · ' : '') + '<button type="button" data-inbox="1">질문함 열기</button></div>';
      h += statusNote();
      qin.innerHTML = h;
      bindQ(anchor);
      qsheet.hidden = false;
      var ta = document.getElementById('qtext');
      if (ta && !('ontouchstart' in window)) ta.focus();
    }

    function openInbox() {
      qview = 'inbox';
      closeSheet();
      var all = allQuestions();
      var d = all.filter(function (q) { return q.status === 'draft'; });
      var w = all.filter(function (q) { return q.status === 'asked'; });
      var a = all.filter(function (q) { return q.status === 'answered'; });
      var mineDrafts = d.filter(function (q) { return q.mine !== false; });
      var resend = stalled() ? w.filter(function (q) { return q.mine !== false; }) : [];
      var h = '<div class="sh-head"><b>질문함</b><button type="button" data-close="1">닫기</button></div>';
      h += statusNote();
      var an = a.filter(isNewAns), ar = a.filter(function (q) { return !isNewAns(q); });
      var onlyNew = S.qf === 'new' && a.length > 0;
      if (a.length) h += '<div class="qs-filter" role="group" aria-label="보기"><button type="button" data-qf="all"' + (onlyNew ? '' : ' class="on" aria-pressed="true"') + '>전체 ' + all.length + '</button><button type="button" data-qf="new"' + (onlyNew ? ' class="on" aria-pressed="true"' : '') + '>안 읽은 답만 ' + an.length + '</button></div>';
      if (onlyNew) {
        if (an.length) h += '<div class="qs-sec">안 읽은 답 ' + an.length + '</div>' + an.map(function (q) { return item(q, { where: 1 }); }).join('') + '<div class="btns"><button type="button" class="btn qa" data-only="1">안 읽은 답만 차례로 넘겨 보기</button><button type="button" class="btn line" data-allread="1">모두 읽음으로</button></div>';
        else h += '<div class="qs-empty">안 읽은 답이 없어요. 다 읽으셨어요.</div>';
        h += '<div class="qs-note">읽음 표시는 이 기기에 남아요. 다른 기기에서 읽은 답이 새 답으로 보이면 <b>모두 읽음으로</b>를 누르세요.</div>';
        qin.innerHTML = h;
        bindQ(null);
        qsheet.hidden = false;
        return;
      }
      if (!all.length) h += '<div class="qs-empty">아직 남긴 질문이 없어요. 읽다가 궁금한 장에서 아래 <b>질문</b>을 누르세요.</div>';
      if (d.length) h += '<div class="qs-sec">보내기 전 ' + d.length + '</div>' + d.map(function (q) { return item(q, { where: 1 }); }).join('');
      if (w.length) {
        h += '<div class="qs-sec">' + (resend.length ? '답을 못 받았어요 ' : '답 기다리는 중 ') + w.length + (QA.handoff && !resend.length ? ' · ' + esc(QA.handoff.label) : '') + '</div>';
        if (QA.handoff && QA.handoff.note) h += '<div class="qs-note warn">' + esc(QA.handoff.note) + '</div>';
        if (QA.handoff && QA.handoff.phase === 'question') h += '<div class="qs-note warn">AI가 답을 쓰다가 되물었어요.' + (QA.issueUrl ? ' <a href="' + esc(QA.issueUrl) + '" target="_blank" rel="noopener">이슈에서 답하기</a>' : '') + '</div>';
        if (resend.length) h += '<div class="qs-note warn">AI 작업이 이 질문들에 답하지 못하고 끝났어요. 아래 버튼으로 다시 보낼 수 있어요.</div>';
        h += w.map(function (q) { return item(q, { where: 1 }); }).join('');
      }
      if (an.length) h += '<div class="qs-sec">새 답 ' + an.length + '</div>' + an.slice().reverse().map(function (q) { return item(q, { where: 1 }); }).join('');
      if (ar.length) h += '<div class="qs-sec">읽은 답 ' + ar.length + '</div>' + ar.slice().reverse().map(function (q) { return item(q, { where: 1 }); }).join('');
      var sendN = mineDrafts.length + resend.length;
      var label = mineDrafts.length ? '물어보기 · 질문 ' + sendN + '개 AI에게 보내기' : (resend.length ? '다시 보내기 · 답 못 받은 질문 ' + resend.length + '개' : '보낼 질문이 없어요');
      h += '<div class="btns"><button type="button" class="btn primary qa" id="qask"' + (sendN ? '' : ' disabled') + '>' + label + '</button></div>';
      h += '<div class="qs-note">누르면 모아 둔 질문이 대시보드 이슈' + (QA.issue ? ' #' + QA.issue : '') + '에 추가요청으로 올라가고 AI가 이어서 답을 써요. 답은 질문한 장 바로 뒤에 노란 <b>답 장</b>으로 붙고, 이 화면을 열어 두면 도착하는 대로 알려 드려요.</div>';
      qin.innerHTML = h;
      bindQ(null);
      qsheet.hidden = false;
    }

    function bindQ(anchor) {
      bind(qin, cards[Math.max(cur, 0)]);
      qin.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeQ); });
      var sv = document.getElementById('qsave');
      if (sv) sv.addEventListener('click', function () {
        var ta = document.getElementById('qtext');
        var text = (ta.value || '').trim();
        if (!text) { ta.focus(); toast('궁금한 것을 먼저 적어 주세요.'); return; }
        sv.disabled = true; sv.textContent = '모으는 중…';
        addQuestion(anchor, text).then(function (where) {
          toast(where === 'local' ? '이 기기에 모아 뒀어요.' : '모아 뒀어요. 다 읽고 질문함에서 물어보기를 누르세요.', 2400);
          closeQ();
          paintQ();
        });
      });
      var ak = document.getElementById('qask');
      if (ak) ak.addEventListener('click', function () { askNow(ak); });
      qin.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () { removeQuestion(b.getAttribute('data-del')).then(reopen); });
      });
      qin.querySelectorAll('[data-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-edit');
          var box = qin.querySelector('[data-qid="' + id + '"]');
          var q = allQuestions().filter(function (y) { return String(y.id) === id; })[0];
          if (!box || !q) return;
          box.innerHTML = '<textarea class="qi-ta" maxlength="2000">' + esc(q.body) + '</textarea><div class="qi-act"><button type="button" class="on" data-keep="1">저장</button><button type="button" data-cancel="1">취소</button></div>';
          box.querySelector('[data-cancel]').addEventListener('click', reopen);
          box.querySelector('[data-keep]').addEventListener('click', function () {
            var t = (box.querySelector('textarea').value || '').trim();
            if (!t) return;
            editQuestion(id, t).then(reopen);
          });
        });
      });
    }
    function reopen() {
      var ta = document.getElementById('qtext');
      var keep = ta ? ta.value : '';
      if (qview === 'inbox') openInbox(); else if (qview === 'card') openCardQ();
      var nt = document.getElementById('qtext');
      if (nt && keep) nt.value = keep;
      paintQ();
    }

    function paintQ() {
      if (!QA.on) return;
      askBtn.hidden = false;
      qboxBtn.hidden = false;
      navEl.classList.add('has-q');
      var x = cur >= 0 ? cards[cur] : null;
      var n = x ? allQuestions().filter(function (q) { return q.card_ref === anchorOf(x); }).length : 0;
      askBtn.innerHTML = '질문' + (n ? '<i class="dot">' + n + '</i>' : '');
      var d = drafts().length;
      var news = newAnswers().length;
      qboxBtn.innerHTML = '질문함' + (news ? '<i class="dot new">' + news + '</i>' : (d ? '<i class="dot">' + d + '</i>' : ''));
      qboxBtn.setAttribute('aria-label', '질문함' + (d ? ', 모아 둔 질문 ' + d + '개' : '') + (news ? ', 새 답 ' + news + '개' : ''));
    }

    function server() { return QA.status === 'ok'; }
    function ready() { return QA.status === 'idle' && QA.wait ? QA.wait.then(null, function () {}) : Promise.resolve(); }
    function addQuestion(anchor, text) {
      return ready().then(function () { return addQuestionNow(anchor, text); });
    }
    function addQuestionNow(anchor, text) {
      var payload = { card_ref: anchor.ref, card_label: labelOf(anchor), card_title: titleOf(anchor), body: text };
      function local() { var a = localDrafts(); a.push({ ref: payload.card_ref, label: payload.card_label, title: payload.card_title, body: text, at: Date.now() }); setLocalDrafts(a); return 'local'; }
      if (!server()) return Promise.resolve(local());
      return api('POST', '/story-boards/' + BOARD.key + '/questions', payload).then(function (r) {
        if (r.status === 200) { applyBoard(r.json.data); return 'server'; }
        if (r.status === 401) { QA.status = 'guest'; }
        toast((r.json && r.json.message) || '서버에 못 남겨서 이 기기에 모아 뒀어요.');
        return local();
      }, function () { QA.status = 'error'; return local(); });
    }
    function removeQuestion(id) {
      if (String(id).charAt(0) === 'L') { var a = localDrafts(); a.splice(+String(id).slice(1), 1); setLocalDrafts(a); return Promise.resolve(); }
      return api('DELETE', '/story-boards/' + BOARD.key + '/questions/' + id).then(function (r) {
        if (r.status === 200) applyBoard(r.json.data); else toast((r.json && r.json.message) || '지우지 못했어요.');
      }, function () { toast('연결이 끊겼어요. 다시 눌러 주세요.'); });
    }
    function editQuestion(id, text) {
      if (String(id).charAt(0) === 'L') { var a = localDrafts(); var k = +String(id).slice(1); if (a[k]) a[k].body = text; setLocalDrafts(a); return Promise.resolve(); }
      return api('PATCH', '/story-boards/' + BOARD.key + '/questions/' + id, { body: text }).then(function (r) {
        if (r.status === 200) applyBoard(r.json.data); else toast((r.json && r.json.message) || '고치지 못했어요.');
      }, function () { toast('연결이 끊겼어요. 다시 눌러 주세요.'); });
    }
    function askNow(btn) {
      if (QA.status === 'idle' && QA.wait) { btn.disabled = true; ready().then(function () { askNow(btn); }); return; }
      if (!server()) {
        toast(QA.status === 'guest' ? '대시보드에 로그인해야 물어볼 수 있어요. 질문함 위 안내를 보세요.' : '지금은 서버에 연결이 안 돼요. 잠시 뒤 다시 눌러 주세요.', 2600);
        return;
      }
      btn.disabled = true; btn.textContent = '보내는 중…';
      api('POST', '/story-boards/' + BOARD.key + '/ask').then(function (r) {
        if (r.status === 200) { applyBoard(r.json.data); toast('보냈어요. 답이 오면 질문한 장 바로 뒤에 붙어요.', 2600); }
        else toast((r.json && r.json.message) || '보내지 못했어요. 다시 눌러 주세요.', 2600);
        reopen();
      }, function () { toast('연결이 끊겼어요. 다시 눌러 주세요.'); reopen(); });
    }

    function sigOf(list) { return JSON.stringify(list.map(function (q) { return [q.id, q.status, q.body, q.answered_at, q.fixed]; })); }
    function applyBoard(b) {
      var before = {};
      answered().forEach(function (q) { before[q.id] = 1; });
      QA.status = 'ok'; QA.me = b.me; QA.list = b.questions || []; QA.handoff = b.handoff; QA.issue = b.issue && b.issue.id; QA.issueUrl = b.issue && b.issue.url;
      var fresh = answered().filter(function (q) { return !before[q.id]; }).length;
      var sig = sigOf(QA.list) + '|' + (QA.handoff ? QA.handoff.phase : '');
      var changed = sig !== QA.sig;
      QA.sig = sig;
      if (changed) { rebuild(); if (!qsheet.hidden && qview === 'inbox' && !qin.querySelector('.qi-ta')) openInbox(); repaint(); } else paintQ();
      if (QA.loaded && fresh) toast('답 ' + fresh + '개가 왔어요. 질문한 장 바로 뒤에 붙었어요.', 3200);
      QA.loaded = true;
      schedulePoll();
    }
    function uploadLocal() {
      var a = localDrafts();
      if (!a.length || !server()) return Promise.resolve();
      var chain = Promise.resolve();
      a.forEach(function (d) {
        chain = chain.then(function () {
          return api('POST', '/story-boards/' + BOARD.key + '/questions', { card_ref: d.ref, card_label: d.label, card_title: d.title, body: d.body }).then(function (r) {
            if (r.status === 200) { var rest = localDrafts().filter(function (y) { return !(y.at === d.at && y.body === d.body); }); setLocalDrafts(rest); applyBoard(r.json.data); }
          });
        });
      });
      return chain.then(function () { toast('이 기기에 모아 둔 질문을 서버로 옮겼어요.'); });
    }
    function loadBoard() {
      if (!BOARD) return Promise.resolve();
      if (!token()) { QA.status = 'guest'; paintQ(); return Promise.resolve(); }
      QA.wait = api('GET', '/story-boards/' + BOARD.key).then(function (r) {
        if (r.status === 200) { applyBoard(r.json.data); return uploadLocal(); }
        QA.status = r.status === 401 ? 'guest' : (r.status === 403 ? 'denied' : 'error');
        QA.msg = (r.json && r.json.message) || '';
        paintQ();
      }, function () { QA.status = 'error'; paintQ(); });
      return QA.wait;
    }
    var pollTimer = null, pollUntil = 0;
    function schedulePoll() {
      clearTimeout(pollTimer);
      if (!waiting().length) { pollUntil = 0; return; }
      if (!pollUntil) pollUntil = Date.now() + 45 * 60 * 1000;
      if (Date.now() > pollUntil) return;
      pollTimer = setTimeout(function () {
        if (document.hidden) { schedulePoll(); return; }
        api('GET', '/story-boards/' + BOARD.key).then(function (r) { if (r.status === 200) applyBoard(r.json.data); else schedulePoll(); }, schedulePoll);
      }, 20000);
    }
    if (QA.on) {
      askBtn.addEventListener('click', openCardQ);
      qboxBtn.addEventListener('click', openInbox);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) return;
        if (QA.status !== 'ok' && token()) loadBoard();
        else if (waiting().length) { pollUntil = 0; loadBoard(); }
      });
    }

    var allMode = /(^|[#&])all\b/.test(location.hash);
    function renderAll() {
      app.classList.add('is-all');
      app.setAttribute('data-tone', 'slate');
      navEl.style.display = 'none';
      bars.innerHTML = '';
      topLabel.innerHTML = esc(D.title) + '<small>한 번에 다 보기</small>';
      var wrap = document.createElement('div');
      wrap.className = 'allwrap';
      cards.forEach(function (x) {
        var el = document.createElement('article');
        el.className = 'card' + (x.isAns ? ' is-answer' : '');
        el.setAttribute('data-tone', D.chapters[x.ci].tone || 'blue');
        el.id = 'p' + (x.i + 1);
        el.innerHTML = renderCard(x);
        wrap.appendChild(el);
        bind(el, x);
      });
      stage.innerHTML = '';
      stage.appendChild(wrap);
      go = function (i) { if (i === 0) { location.hash = ''; location.reload(); return; } var t = document.getElementById('p' + (i + 1)); if (t) t.scrollIntoView(); };
      paintQ();
    }

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { hintCheck(); });
    if (allMode) renderAll();
    else {
      var m = /p=(\d+)/.exec(location.hash);
      go(m ? Math.min(Math.max(+m[1] - 1, 0), N - 1) : 0, 0);
    }
    if (firstBoard) { applyBoard(firstBoard); uploadLocal(); } else loadBoard();
  }
})();
