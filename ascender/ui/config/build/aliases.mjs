import { fileURLToPath, URL } from 'node:url';

const srcPath = fileURLToPath(new URL('../../src', import.meta.url));

/*
 * Absolute imports out of src, as `import { JobsAPI } from 'api'`.
 *
 * Under webpack these resolved through resolve.modules, which put src on the
 * module search path, derived from the baseUrl in jsconfig.json. Vite has no
 * such search path, so each prefix is an explicit alias. The list is every
 * top-level entry in src that is imported bare somewhere, and it is shared
 * with the test config so the two cannot drift: a module that resolves when
 * the application builds has to resolve the same way when it is tested.
 */
export const srcAliases = [
  {
    // Anchored, so node's own util is still reachable as node:util.
    find: /^(api|components|contexts|hooks|screens|types|util)(\/|$)/,
    replacement: `${srcPath}/$1$2`,
  },
  { find: /^i18nLoader$/, replacement: `${srcPath}/i18nLoader.ts` },
  { find: /^themeRegistry$/, replacement: `${srcPath}/themeRegistry.ts` },
];

export default srcAliases;
