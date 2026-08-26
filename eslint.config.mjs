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
})
