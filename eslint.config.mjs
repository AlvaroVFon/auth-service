// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'build/**', 'test/fixtures/**'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['test/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    languageOptions: {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        assert: 'readonly',
      },
    },
  },
);
