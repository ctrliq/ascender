// Regenerates intl.json: the browser's (ICU's) plural categories and
// number formats, which Lingui uses, for the UI's languages.
//   node testdata/gen_intl.js > testdata/intl.json
const langs = ['en', 'ar', 'es', 'fr', 'hi', 'ja', 'ko', 'nl', 'zh'];
const ns = [0, 1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 21, 22, 23, 100, 101, 102, 103, 111, 999, 1000, 1001, 1234, 12345, 123456, 1234567, 1000000, 2000000, 1.5, 0.5, -1, -1234];
const out = {};
for (const l of langs) {
  out[l] = ns.map((n) => [n,
    new Intl.PluralRules(l).select(n),
    new Intl.PluralRules(l, { type: 'ordinal' }).select(n),
    new Intl.NumberFormat(l).format(n)]);
}
console.log("{\n" + langs.map((l) => " " + JSON.stringify(l) + ": " + JSON.stringify(out[l])).join(",\n") + "\n}");
