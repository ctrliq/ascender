/* Translation for the page scripts: window.t(msgid, values) returns the
   message in the page's language, the way internal/i18n's Locale.T does on
   the server. The catalog (window.ASCENDER_I18N) is loaded from
   /i18n/<lang>.js before this file; English pages have none and show the
   msgid. Messages are ICU MessageFormat as Lingui wrote them: {name},
   {n, plural, one {...} other {...}}, selectordinal and select, with # for
   the number. t() returns text: callers escape it like any other text. */
(function () {
  'use strict';
  var A = window.ASCENDER || {};
  var lang = A.lang || document.documentElement.lang || 'en';
  var catalog = window.ASCENDER_I18N || {};
  var norm = null;
  var cache = {};

  function collapse(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  function lookup(id) {
    var s = catalog[id];
    if (typeof s === 'string' && s) return s;
    if (!norm) {
      norm = {};
      Object.keys(catalog).forEach(function (k) { var c = collapse(k); if (c !== k) norm[c] = k; });
    }
    var k = norm[collapse(id)];
    return k && typeof catalog[k] === 'string' ? collapse(catalog[k]) : '';
  }

  // parse turns a message into nodes: strings, {arg}, {arg, type, cases}.
  function parse(msg) {
    var pos = 0;
    function nodes(inPlural) {
      var out = [], text = '';
      function flush() { if (text) { out.push(text); text = ''; } }
      while (pos < msg.length) {
        var c = msg[pos];
        if (c === '}') break;
        if (c === '{') { flush(); out.push(argument()); continue; }
        if (c === '#' && inPlural) { flush(); out.push({ pound: true }); pos++; continue; }
        if (c === "'") {
          var n = msg[pos + 1];
          if (n === "'") { text += "'"; pos += 2; continue; }
          if (n === '{' || n === '}' || (inPlural && n === '#')) {
            pos++;
            while (pos < msg.length) {
              if (msg[pos] === "'") { if (msg[pos + 1] === "'") { text += "'"; pos += 2; continue; } pos++; break; }
              text += msg[pos++];
            }
            continue;
          }
        }
        text += c; pos++;
      }
      flush();
      return out;
    }
    function space() { while (pos < msg.length && /\s/.test(msg[pos])) pos++; }
    function word() { space(); var s = pos; while (pos < msg.length && !/[\s,{}]/.test(msg[pos])) pos++; return msg.slice(s, pos); }
    function argument() {
      pos++;
      var name = word(); space();
      if (msg[pos] === '}') { pos++; return { arg: name }; }
      if (msg[pos] !== ',') throw new Error('bad message');
      pos++;
      var node = { arg: name, type: word(), offset: 0, cases: {} };
      space(); if (msg[pos] !== ',') throw new Error('bad message'); pos++;
      for (;;) {
        var key = word();
        if (!key) { space(); if (msg[pos] === '}') { pos++; return node; } throw new Error('bad message'); }
        if (key.indexOf('offset:') === 0) { node.offset = Number(key.slice(7)); continue; }
        space(); if (msg[pos] !== '{') throw new Error('bad message'); pos++;
        node.cases[key] = nodes(node.type !== 'select');
        if (msg[pos] !== '}') throw new Error('bad message'); pos++;
      }
    }
    var out = nodes(false);
    if (pos < msg.length) throw new Error('bad message');
    return out;
  }

  function parsed(msg) {
    if (!(msg in cache)) { try { cache[msg] = parse(msg); } catch (e) { cache[msg] = [msg]; } }
    return cache[msg];
  }

  function render(nodes, values, pound) {
    return nodes.map(function (n) {
      if (typeof n === 'string') return n.replace(/<\/?\d+\/?>/g, '');
      if (n.pound) return pound === undefined ? '' : new Intl.NumberFormat(lang).format(pound);
      var v = values[n.arg];
      if (!n.type) return v === undefined || v === null ? '' : String(v);
      var c = n.cases;
      if (n.type === 'select') return render(c[String(v)] || c.other || [], values, pound);
      var num = Number(v);
      if (v === undefined || v === null || v === '' || isNaN(num)) return render(c.other || [], values);
      var rel = num - n.offset;
      var cat = new Intl.PluralRules(lang, n.type === 'selectordinal' ? { type: 'ordinal' } : undefined).select(rel);
      return render(c['=' + num] || c[cat] || c.other || [], values, rel);
    }).join('');
  }

  window.t = function (id, values) {
    var out = render(parsed(lookup(id) || id), values || {});
    return A.pseudo ? '»' + out + '«' : out;
  };
})();
