import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Module boundaries (spec 02): pure packages must not reach UI, storage or the network. */
const pureRestrictions = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['react', 'react-dom', 'react/*', '@tiptap/*'],
          message: 'Pure packages must not depend on UI code.',
        },
        {
          group: ['dexie', '@panoya/storage'],
          message: 'Pure packages must not depend on storage.',
        },
      ],
    },
  ],
  'no-restricted-globals': [
    'error',
    'window',
    'document',
    'localStorage',
    'fetch',
    'XMLHttpRequest',
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'spec/**',
      '**/node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: [
      'packages/domain/src/**',
      'packages/blocks/src/**',
      'packages/search/src/**',
      'packages/data/src/**',
    ],
    rules: pureRestrictions,
  },
  {
    files: ['packages/storage/src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', '@tiptap/*'],
              message: 'Storage must not depend on UI.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // UI must go through commands/repository, never the database directly.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['dexie'], message: 'Use WorkspaceStore commands instead of Dexie.' },
          ],
        },
      ],
    },
  },
);
