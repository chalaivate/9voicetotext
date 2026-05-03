/* eslint-env node */
module.exports = {
  root: true,
  env: { node: true, browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    '@electron-toolkit/eslint-config-ts/recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  ignorePatterns: ['out/', 'dist/', 'node_modules/', 'resources/', '*.cjs'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn'
  }
};
