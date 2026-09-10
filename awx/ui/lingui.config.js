const { defineConfig } = require('@lingui/cli');
const { formatter } = require('@lingui/format-po');

module.exports = defineConfig({
  catalogs: [
    {
      path: '<rootDir>/locales/{locale}/messages',
      include: ['<rootDir>'],
      exclude: ['**/node_modules/**'],
    },
  ],
  // ES modules rather than the module.exports the ejected build wanted. The
  // production bundler converted that for us, so it only showed up on the dev
  // server, where the catalogue is served as written and the browser has no
  // `module` to assign to.
  compileNamespace: 'es',
  fallbackLocales: { default: 'en' },
  locales: ['en', 'es', 'fr', 'hi', 'ko', 'nl', 'zh', 'ja', 'ar'],
  orderBy: 'messageId',
  rootDir: './src',
  runtimeConfigModule: ['@lingui/core', 'i18n'],
  sourceLocale: 'en',
  format: formatter({
    lineNumbers: true,
    foldLength: 0 // Don't wrap long lines
  }),
});
