// Interactive catalogue of RFC 9457 problem types.
//
// Data comes from the `problems` prop, generated into problems.mdx by
// scripts/build-problems. This file is hand-owned -- edit it directly.
//
// Sorting and filtering are TanStack Table's, via @tanstack/table-core. Getting
// it in here needs two tricks, both load-bearing:
//
//   * Mintlify compiles a snippet by lifting out its exported declarations and
//     injecting React's hooks through the call scope. Every `import` is
//     stripped, leaving an undefined free variable -- npm specifier and URL
//     alike. So the module is fetched at runtime by a <script type="module">
//     whose source Mintlify never parses. See loadTableCore.
//   * `@tanstack/react-table` is unusable regardless: it peer-depends on React,
//     and a second React instance from the CDN throws "Invalid hook call".
//     `@tanstack/table-core` is framework-agnostic with zero dependencies, so
//     this binds it to React by hand -- that adapter is ~10 lines.
//
// The same compile step DISCARDS top-level statements outside the export, so a
// module-level const referenced here would throw ReferenceError and render
// nothing, with no error on the page. Everything lives inside the component.
//
// If the CDN is unreachable the table still renders, filtered and sorted by the
// local fallback: this page documents error codes, so it is exactly the page
// someone loads when things are already broken.

export function ProblemsTable({ problems = [] }) {
  const CDN = 'https://esm.sh/@tanstack/table-core@8.21.3'

  const [core, setCore] = useState(null)
  const [sorting, setSorting] = useState([{ id: 'slug', desc: false }])
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('All')
  const [target, setTarget] = useState(null)

  // Fetch table-core through a module script. Mintlify strips imports written in
  // this file, but never sees the text of a script created at runtime.
  useEffect(() => {
    if (window.__photonTableCore) {
      setCore(window.__photonTableCore)
      return
    }
    const id = '__photon_table_core_loader'
    const done = () => setCore(window.__photonTableCore ?? null)
    window.addEventListener('photon-table-core', done)
    if (!document.getElementById(id)) {
      const el = document.createElement('script')
      el.id = id
      el.type = 'module'
      el.textContent = `
        try {
          const m = await import(${JSON.stringify(CDN)})
          window.__photonTableCore = m
        } catch { window.__photonTableCore = null }
        window.dispatchEvent(new Event('photon-table-core'))
      `
      document.head.appendChild(el)
    }
    return () => window.removeEventListener('photon-table-core', done)
  }, [])

  // Sortable columns shown in the header row.
  const headers = useMemo(() => [
    { key: 'slug', label: 'Type' },
    { key: 'code', label: 'Code' },
    { key: 'status', label: 'Status' },
  ], [])

  // The table model also carries title and group so the global filter reaches
  // them -- searching a description or an area has to work even though neither
  // gets a column of its own. Cells are rendered by hand below, so a column in
  // the model does not imply a column on screen.
  const columns = useMemo(() => [
    ...headers.map(h => ({ accessorKey: h.key })),
    { accessorKey: 'title' },
    { accessorKey: 'group' },
  ], [headers])

  const groups = useMemo(
    () => ['All', ...[...new Set(problems.map(p => p.group))]],
    [problems],
  )

  const filtered = useMemo(
    () => (group === 'All' ? problems : problems.filter(p => p.group === group)),
    [problems, group],
  )

  // Hand-rolled adapter: table-core is headless, so React state drives it and
  // every state change re-renders through setState.
  const table = useMemo(() => {
    if (!core)
      return null
    const instance = core.createTable({
      data: filtered,
      columns,
      state: {},
      onStateChange: () => {},
      renderFallbackValue: null,
      getCoreRowModel: core.getCoreRowModel(),
      getSortedRowModel: core.getSortedRowModel(),
      getFilteredRowModel: core.getFilteredRowModel(),
      globalFilterFn: 'includesString',
    })
    return instance
  }, [core, filtered, columns])

  if (table) {
    table.setOptions(prev => ({
      ...prev,
      data: filtered,
      state: { ...prev.state, sorting, globalFilter: query },
      onSortingChange: setSorting,
      onGlobalFilterChange: setQuery,
    }))
  }

  // Fallback path, used until the CDN answers and permanently if it never does.
  const localRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = filtered.filter(p => !needle
      || `${p.slug} ${p.code} ${p.title} ${p.group} ${p.status}`.toLowerCase().includes(needle))
    const { id, desc } = sorting[0] ?? { id: 'slug', desc: false }
    rows.sort((a, b) => (id === 'status'
      ? a.status - b.status || a.slug.localeCompare(b.slug)
      : String(a[id]).localeCompare(String(b[id]))))
    return desc ? rows.reverse() : rows
  }, [filtered, query, sorting])

  const rows = table ? table.getRowModel().rows.map(r => r.original) : localRows

  // problems.mdx also emits a plain markdown table, which is what search
  // engines and non-JS AI crawlers actually read -- Mintlify server-renders this
  // component as null. Retire it now that the interactive table is live.
  useEffect(() => {
    const staticTable = document.getElementById('problems-static')
    if (staticTable)
      staticTable.hidden = true
  }, [])

  // A type URI lands here as a hash. Drop any active filter first: a row the
  // reader was sent to must never be one the current search happens to exclude.
  useEffect(() => {
    const revealFromHash = () => {
      const slug = decodeURIComponent((window.location.hash || '').replace(/^#/, ''))
      if (!slug)
        return
      setQuery('')
      setGroup('All')
      setTarget(slug)
      requestAnimationFrame(() => {
        const row = document.getElementById(slug)
        if (row)
          row.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    }
    revealFromHash()
    window.addEventListener('hashchange', revealFromHash)
    return () => window.removeEventListener('hashchange', revealFromHash)
  }, [])

  const toggleSort = (id) => {
    setSorting(([current] = {}) =>
      current && current.id === id ? [{ id, desc: !current.desc }] : [{ id, desc: false }])
  }

  const arrowFor = (id) => {
    const active = sorting[0]
    if (!active || active.id !== id)
      return ''
    return active.desc ? '↓' : '↑'
  }

  return (
    <div className="pt-catalogue w-full max-w-full contain-[inline-size]">
      <div className="pt-controls">
        <input
          className="pt-search"
          type="search"
          value={query}
          placeholder={`Search ${problems.length} problems by type, code, or status`}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search problems"
        />
        <select
          className="pt-group"
          value={group}
          onChange={e => setGroup(e.target.value)}
          aria-label="Filter by group"
        >
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      <div className="pt-scroll">
        <table className="pt-table">
          <thead>
            <tr>
              {headers.map(col => (
                <th
                  key={col.key}
                  className="pt-sortable"
                  onClick={() => toggleSort(col.key)}
                  aria-sort={sorting[0]?.id === col.key ? (sorting[0].desc ? 'descending' : 'ascending') : 'none'}
                >
                  {col.label}
                  <span className="pt-arrow">{arrowFor(col.key)}</span>
                </th>
              ))}
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.slug} id={p.slug} className={p.slug === target ? 'pt-row pt-target' : 'pt-row'}>
                <td><code>{p.slug}</code></td>
                <td><code>{p.code}</code></td>
                <td><code className={p.status >= 500 ? 'pt-5xx' : 'pt-4xx'}>{p.status}</code></td>
                <td>
                  {p.title}
                  {p.extensions?.length > 0 && (
                    <span className="pt-meta">{` Adds ${p.extensions.join(', ')}.`}</span>
                  )}
                  {p.chassis && <span className="pt-meta">{' Any endpoint can return it.'}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="pt-empty">{`No problem matches “${query}”.`}</p>
      )}
      {rows.length > 0 && (
        <p className="pt-count">{`Showing ${rows.length} of ${problems.length} problems.`}</p>
      )}
    </div>
  )
}
