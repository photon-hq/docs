# Docs style guide

This repo is Mintlify docs with [vellum](https://github.com/photon-hq/vellum) driving type extraction from installed packages. `.mdx.vel` files are templates rendered by `npx vellum build`; the rendered `.mdx` files ship to Mintlify.

The rules below are what we've converged on. Follow them when adding or editing any page in `docs-src/`.

## Generate from the source, not from memory

If you're writing something that already exists in a `.d.ts`, pull it through vellum. Hand-written type info drifts the moment the package is bumped.

| Doc surface                                  | Vellum field      | Notes                                                                                                                               |
| -------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Full declaration text                        | `sym.signature`   | Canonical printer output, matches `tsc --declaration`. JSDoc stripped, bodies removed.                                              |
| Interface property tables                    | `sym.members[]`   | Each has `.name`, `.type.text`, `.optional`, `.readonly`, `.doc.summary`.                                                           |
| Enum / `as const` / discriminated-union rows | `sym.variants[]`  | Each has `.name`, `.value.text`, optionally `.fields[]` (for discriminated unions). Also set `sym.discriminator` for union tag key. |
| Descriptions                                 | `sym.doc.summary` | First paragraph of TSDoc. Always prefer this over hand-written blurbs.                                                              |

## Inline type references → `<TypeTooltip>`

Every `.mdx.vel` file that mentions a type symbol in prose imports:

```mdx
import { TypeTooltip } from "/snippets/type-tooltip.mdx";
```

Use `<TypeTooltip>` whenever a named type appears inline - method return type, parameter, passing reference. Hover shows the full declaration.

```mdx
{% set chatType = symbol("ts:@photon-ai/advanced-imessage#Chat") %}
Returns a <TypeTooltip name="Chat" type={`{{ chatType.signature }}`} /> with the chat's identifiers, participants, and status flags.
```

- One `{% set %}` per symbol, placed at the first reference. Later mentions reuse the binding.
- Pair the tooltip with a short prose description so the sentence still reads without the hover (screen readers, print).
- **Don't** dump the interface as a code block and also reference it inline - pick one. Tooltips are the default for inline references.

## Collapsible details → `<Accordion>`

Use `<Accordion>` when the content is reference material: long options tables, enumerated values, event-type mappings - things users scan for a specific row, not read top-to-bottom.

```mdx
{% set opts = symbol("ts:@photon-ai/advanced-imessage#SendOptions") %}
<Accordion title="SendOptions" description="{{ opts.doc.summary }}">
  | Option | Type | Description |
  |---|---|---|
  {% for m in opts.members -%}
  | `{{ m.name }}` | `{{ m.type.text | replace("\n", " ") | replace("    ", "") | replace("|", "\\|") | replace("<", "&lt;") | replace(">", "&gt;") }}` | {{ m.doc.summary }} |
  {% endfor %}
</Accordion>
```

Rules:

- **Title:** just the type name. No `reference` / `shape` / `values` suffixes.
- **Description:** always `{{ sym.doc.summary }}` when a symbol exists. If it doesn't (purely documentation-level tables), write a one-sentence description in the same voice.
- Stack related accordions in `<AccordionGroup>` (e.g. `MessageEffect` + `TextEffect`).
- Table cells containing TS type text need the standard escape chain: `replace("\n", " ") | replace("    ", "") | replace("|", "\\|") | replace("<", "&lt;") | replace(">", "&gt;")`.

## Alternative code examples → `<Tabs>`

When showing the same task in multiple ways (e.g. plain text / with options / builder API), use `<Tabs>`, not successive `###` headings.

````mdx
<Tabs>
  <Tab title="Plain text">
    ```ts
    await im.messages.send(chat, "Hello!");
    ```
  </Tab>
  <Tab title="With options">
    ...
  </Tab>
</Tabs>
````

## Code blocks

- **No type annotations in comments.** `// info: AttachmentInfo | null` in a code block is wrong; move it to prose underneath with a `<TypeTooltip>`.
- **No scare-quote comments** (`// Narrowed`, `// Returns`). Either explain in surrounding prose or delete.
- Keep snippets minimal - real API calls, no mock data shaped to look real.

## Auto-gen over hand-writing tables

When a table's rows map 1:1 to source members/variants, drive it from vellum:

```njk
{% for v in sym.variants -%}
| `{{ v.name }}` | {% if v.fields and v.fields|length %}{% for f in v.fields %}`{{ f.name }}{% if f.optional %}?{% endif %}`{% if not loop.last %}, {% endif %}{% endfor %}{% else %}-{% endif %} |
{% endfor %}
```

Hand-write tables only when:

- There's no corresponding symbol (gRPC status → SDK error class mapping, error hierarchy tree).
- You're adding categorization or editorial structure that isn't in the source (e.g. grouping 22 error codes into 6 categories). Keep the table hand-written but wrap it in an `<Accordion>` with `{{ sym.doc.summary }}` as description.
- Dynamic counts: if you reference a count in prose ("X has N values"), use `{{ sym.variants | length }}` so it stays correct as the enum grows.

## When vellum can't reach it

Vellum extracts well-formed patterns; some TS shapes fall through to `kind: 'type'` with only `aliasOf` populated. Known fall-through cases:

- **Unions of named references** (`type X = Foo | Bar`, not inline). Extractor doesn't cross-resolve arms.
- **Non-literal discriminators** (`{ type: SomeStringEnum }`).
- **Mixed unions** (`string | { type: "foo" }`).
- **Pure literal unions** (`"a" | "b" | "c"` with no fields). No variant extraction - hand-write the table, wrap in Accordion with `{{ sym.doc.summary }}`.

If you hit one of these, file an issue upstream rather than working around it indefinitely. Past examples: [const-object enum promotion](https://github.com/photon-hq/vellum/releases) (shipped), [discriminated-union variants](https://github.com/photon-hq/vellum/releases) (shipped).

## File layout

- Source: `docs-src/**/*.mdx.vel`
- Output: `**/*.mdx` (built, don't edit directly)
- Shared components: `snippets/` (e.g. `type-tooltip.mdx`)
- Mintlify config: `docs.json`
- Custom CSS: `custom.css` (keep selectors narrow - broad `[class*="..."]` selectors have bitten us; see accordion-title-monospace incident)

## Checklist for new pages

- [ ] `import { TypeTooltip } from "/snippets/type-tooltip.mdx";` if the page references named types
- [ ] Every named type mention uses `<TypeTooltip>` or appears in an auto-gen table
- [ ] No interface/class declarations written by hand - `sym.signature` covers them
- [ ] Tables that map to source members/variants use `{% for %}` loops
- [ ] Accordion titles are bare type names; descriptions come from `doc.summary`
- [ ] No `// TypeName` comments in code blocks
