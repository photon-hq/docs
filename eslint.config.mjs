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
  // Mintlify compiles a snippet into a function body and injects React's hooks
  // through the call scope, so they are globals here and cannot be imported.
  // See the header of snippets/problems-table.jsx.
  files: ['snippets/**/*.jsx'],
  languageOptions: {
    globals: {
      useCallback: 'readonly',
      useContext: 'readonly',
      useEffect: 'readonly',
      useMemo: 'readonly',
      useReducer: 'readonly',
      useRef: 'readonly',
      useState: 'readonly',
    },
  },
})
