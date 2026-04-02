import antfu from '@antfu/eslint-config'
import * as mdx from 'eslint-plugin-mdx'

export default antfu({
  // This is a documentation project - disable features we don't need
  typescript: false,
  vue: false,
  jsonc: false,
  yaml: false,

  // Enable markdown support (on by default, but being explicit)
  markdown: true,

  // Enable stylistic formatting rules
  stylistic: true,

  // Use formatters for markdown files via Prettier
  formatters: {
    markdown: 'prettier',
  },
}, mdx.flat, mdx.flatCodeBlocks)
