import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['v2/**'],
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
  files: ['scripts/**/*.test.ts'],
  rules: { 'test/no-import-node-test': 'off' },
})
