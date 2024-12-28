import eslint from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import prettierPlugin from 'eslint-plugin-prettier';
import stylistic from '@stylistic/eslint-plugin';

export default [
  eslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': tsPlugin,
      '@stylistic': stylistic,
      'prettier': prettierPlugin,
    },
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'prettier/prettier': ['error', {
        singleQuote: true,
        trailingComma: 'all',
        printWidth: 180,
        tabWidth: 2,
        useTabs: false,
        semi: true,
        arrowParens: 'always',
        bracketSpacing: true,
        endOfLine: 'lf',
        quoteProps: 'as-needed',
      }],
      '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
      'max-len': ['warn', 200],
      'no-console': 'warn',
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: false }],
      '@stylistic/comma-spacing': ['error', { before: false, after: true }],
      '@stylistic/space-before-function-paren': ['error', {
        anonymous: 'always',
        named: 'never',
        asyncArrow: 'always',
      }],
      '@stylistic/keyword-spacing': ['error', { before: true, after: true }],
      '@stylistic/no-multi-spaces': 'error',
      '@stylistic/object-curly-spacing': ['error', 'always'],
    },
  },
];