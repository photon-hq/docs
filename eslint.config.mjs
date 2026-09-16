import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  vue: false,
  jsonc: false,
  yaml: false,
  markdown: false,
  stylistic: true,
  formatters: {
    markdown: 'prettier',
  },
}, {
  // Build tooling uses Node's test runner without an additional dependency.
  files: ['scripts/**/*.test.ts'],
  rules: {
    'test/no-import-node-test': 'off',
  },
})
