import babelParser from '@babel/eslint-parser';
import { defineConfig } from 'eslint/config';
import path from 'node:path';
import { configs as airbnb, plugins as airbnbPlugins } from 'eslint-config-airbnb-extended';
import { createNodeResolver } from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';
import i18next from 'eslint-plugin-i18next';
// the rule merges options shallowly (lodash defaults) — spread these in
// wherever we customize a group, or the built-in excludes are lost
import i18nextDefaults from 'eslint-plugin-i18next/lib/options/defaults.js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default defineConfig([
  {
    ignores: [
      'jest.*.js',
      'webpack.*.js',
      'etc/**',
      'coverage/**',
      'build/**',
      'node_modules/**',
      'dist/**',
      'images/**',
      '**/*test*.js',
      'config/**',
      'scripts/**',
      'eslint.config.mjs',
    ],
  },
  // Airbnb (flat re-implementation): base + react, with their plugin registrations
  airbnbPlugins.stylistic,
  airbnbPlugins.importX,
  ...airbnb.base.recommended,
  airbnbPlugins.react,
  airbnbPlugins.reactHooks,
  airbnbPlugins.reactA11y,
  ...airbnb.react.recommended,
  // rules only — the jsx-a11y plugin itself is registered by airbnbPlugins.reactA11y
  { rules: jsxA11y.flatConfigs.strict.rules },
  i18next.configs['flat/recommended'],
  prettier,
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        ecmaFeatures: {
          jsx: true,
        },
        babelOptions: {
          presets: ['@babel/preset-react'],
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
      // module resolution mirrors jsconfig.json baseUrl: src
      'import-x/resolver-next': [
        createNodeResolver({
          extensions: ['.mjs', '.cjs', '.js', '.json', '.jsx', '.node'],
          modules: ['node_modules', path.resolve(import.meta.dirname, 'src')],
        }),
      ],
    },
    rules: {
      'i18next/no-literal-string': [
        2,
        {
          mode: 'jsx-text-only',
          'jsx-attributes': {
            exclude: [
              ...i18nextDefaults['jsx-attributes'].exclude,
              'data-testid',
              'dateFieldName',
              'timeFieldName',
              'to',
              'streamType',
              'path',
              'component',
              'variant',
              'key',
              'position',
              'promptName',
              'color',
              'promptId',
              'headingLevel',
              'size',
              'target',
              'autoComplete',
              'trigger',
              'from',
              'name',
              'fieldId',
              'css',
              'gutter',
              'dataCy',
              'tooltipMaxWidth',
              'mode',
              'aria-labelledby',
              'aria-hidden',
              'aria-controls',
              'aria-pressed',
              'sortKey',
              'ouiaId',
              'credentialTypeNamespace',
              'link',
              'value',
              'credentialTypeKind',
              'linkTo',
              'scrollToAlignment',
              'displayKey',
              'sortedColumnKey',
              'maxHeight',
              'maxWidth',
              'role',
              'aria-haspopup',
              'dropDirection',
              'resizeOrientation',
              'src',
              'theme',
              'gridColumns',
              'rows',
              'href',
              'modifier',
              'data-cy',
              'fieldName',
              'splitButtonVariant',
              'pageKey',
              'textId',
              'rel',
            ],
          },
          words: {
            exclude: [
              ...i18nextDefaults.words.exclude,
              'Ansible',
              'Tower',
              'JSON:?',
              'YAML:?',
              'lg',
              'hh:mm AM/PM',
              'Twilio',
            ],
          },
          'jsx-components': {
            exclude: [
              // lingui translation components (v5 ignored these by default)
              'Trans',
              'AboutModal',
              'code',
              'Omit',
              'PotentialLink',
              'TypeRedirect',
              'Radio',
              'RunOnRadio',
              'NodeTypeLetter',
              'SelectableItem',
              'Dash',
              'Plural',
            ],
          },
          callees: {
            exclude: [...i18nextDefaults.callees.exclude, 'describe'],
          },
        },
      ],
      camelcase: 'off',
      '@stylistic/arrow-parens': 'off',
      '@stylistic/comma-dangle': 'off',
      'import-x/no-cycle': 'off',
      // https://github.com/benmosher/eslint-plugin-import/issues/479#issuecomment-252500896
      'import-x/no-extraneous-dependencies': 'off',
      '@stylistic/max-len': [
        'error',
        {
          code: 100,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
        },
      ],
      'no-continue': 'off',
      'no-debugger': 'off',
      'no-param-reassign': 'off',
      'no-plusplus': 'off',
      'no-underscore-dangle': 'off',
      'no-use-before-define': 'off',
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1 }],
      'object-curly-newline': 'off',
      '@stylistic/no-trailing-spaces': ['error'],
      'no-unused-expressions': ['error', { allowShortCircuit: true }],
      // airbnb@19 options; eslint 9 changed the caughtErrors default to 'all'
      'no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
          caughtErrors: 'none',
        },
      ],
      // rules newer than the airbnb@19 baseline this codebase was linted with
      'prefer-object-has-own': 'off',
      'import-x/no-rename-default': 'off',
      'react/jsx-no-useless-fragment': 'error',
      'react/jsx-props-no-spreading': ['off'],
      'react/prefer-stateless-function': 'off',
      'react/prop-types': 'off',
      // default values are expressed via ES default parameters (the React
      // 18.3/19 migration away from the deprecated defaultProps), so accept a
      // destructured default argument in place of a defaultProps entry
      'react/require-default-props': ['error', { functions: 'defaultArguments' }],
      'react/sort-comp': ['error', {}],
      'jsx-a11y/label-has-for': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // react-hooks 7.x ships React Compiler-powered rules; the codebase
      // predates them. Off until addressed as their own effort.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react/jsx-filename-extension': 'off',
      'no-restricted-exports': 'off',
      'react/function-component-definition': 'off',
      'prefer-regex-literals': 'off',
      // Resolve these 2 rules later
      'react/no-unknown-property': [
        'error',
        { ignore: ['css', 'ouia-component-id'] },
      ],
      'react/forbid-prop-types': 'off',
    },
  },
]);
