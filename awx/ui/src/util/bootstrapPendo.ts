/* eslint-disable */
// @ts-nocheck -- vendor snippet from Pendo, kept byte for byte on purpose so it
// can be diffed against theirs. Typing it would mean rewriting it.
function bootstrapPendo(pendoApiKey: string): void {
  (function (p, e, n, d, o) {
    var v, w, x, y, z;
    o = p[d] = p[d] || {};
    o._q = [];
    v = ['initialize', 'identify', 'updateOptions', 'pageLoad'];
    for (w = 0, x = v.length; w < x; ++w)
      (function (m) {
        o[m] =
          o[m] ||
          function () {
            o._q[m === v[0] ? 'unshift' : 'push'](
              [m].concat([].slice.call(arguments, 0))
            );
          };
      })(v[w]);
    y = e.createElement(n);
    y.async = !0;
    y.src = `https://cdn.pendo.io/agent/static/${pendoApiKey}/pendo.js`;
    z = e.getElementsByTagName(n)[0];
    z.parentNode.insertBefore(y, z);
  })(window, document, 'script', 'pendo');
}

export default bootstrapPendo;
