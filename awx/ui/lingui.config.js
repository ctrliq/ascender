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
  compileNamespace: 'cjs',
  fallbackLocales: { default: 'en' },
  locales: ['en', 'es', 'fr', 'hi', 'ko', 'nl', 'zh', 'ja', 'ar'],
  orderBy: 'messageId',
  rootDir: './src',
  runtimeConfigModule: ['@lingui/core', 'i18n'],
  sourceLocale: 'en',
  format: formatter({
    lineNumbers: true, // Prevents line breaks at 80 characters
    foldLength: 0 // Dont wrap long lines
  }),
});
