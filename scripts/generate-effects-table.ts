import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const ROOT = resolve(import.meta.dirname, '..')
const DTS_PATH = resolve(ROOT, 'node_modules/@photon-ai/advanced-imessage/dist/index.d.ts')
const MDX_PATH = resolve(ROOT, 'advanced-kits/imessage/messages.mdx')

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

interface Entry {
  name: string
  value: string
}

interface InterfaceField {
  name: string
  type: string
  optional: boolean
  description: string
}

function parseConstObject(sourceFile: ts.SourceFile, name: string): Entry[] {
  const entries: Entry[] = []

  ts.forEachChild(sourceFile, (node) => {
    if (
      !ts.isVariableStatement(node)
      || !node.modifiers?.some(m => m.kind === ts.SyntaxKind.DeclareKeyword)
    )
      return

    for (const decl of node.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== name)
        continue

      const type = decl.type
      if (!type || !ts.isTypeLiteralNode(type))
        continue

      for (const member of type.members) {
        if (!ts.isPropertySignature(member) || !member.name || !member.type)
          continue

        const key = ts.isIdentifier(member.name)
          ? member.name.text
          : ts.isStringLiteral(member.name)
            ? member.name.text
            : undefined

        const value = ts.isLiteralTypeNode(member.type) && ts.isStringLiteral(member.type.literal)
          ? member.type.literal.text
          : undefined

        if (key && value)
          entries.push({ name: key, value })
      }
    }
  })

  if (entries.length === 0)
    throw new Error(`Could not find "declare const ${name}" with string literal members in .d.ts`)

  return entries
}

function parseInterface(sourceFile: ts.SourceFile, name: string): InterfaceField[] {
  const fields: InterfaceField[] = []

  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isInterfaceDeclaration(node) || node.name.text !== name)
      return

    for (const member of node.members) {
      if (!ts.isPropertySignature(member) || !member.name || !member.type)
        continue

      const key = ts.isIdentifier(member.name)
        ? member.name.text
        : ts.isStringLiteral(member.name)
          ? member.name.text
          : undefined
      if (!key)
        continue

      const optional = !!member.questionToken
      const type = member.type.getText(sourceFile)
        .replace(/readonly /g, '')
        .replace(/\s+/g, ' ') // collapse multi-line types to single line
        .replace(/\$\d+/g, '') // strip internal suffixes like $1
      const description = getJsDocComment(member, sourceFile)

      fields.push({ name: key, type, optional, description })
    }
  })

  if (fields.length === 0)
    throw new Error(`Could not find interface "${name}" in .d.ts`)

  return fields
}

function getJsDocComment(node: ts.Node, sourceFile: ts.SourceFile): string {
  const fullText = sourceFile.getFullText()
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart())
  if (!ranges)
    return ''

  for (const range of ranges) {
    const comment = fullText.slice(range.pos, range.end)
    if (comment.startsWith('/**')) {
      return comment
        .replace(/^\/\*\*\s*/, '')
        .replace(/\s*\*\/$/, '')
        .replace(/^\s*\*\s?/gm, '')
        .trim()
    }
  }
  return ''
}

// ---------------------------------------------------------------------------
// Table builders
// ---------------------------------------------------------------------------

function buildEnumTable(header: string, entries: Entry[]): string {
  const rows = entries.map(e => `| \`${e.name}\` | \`"${e.value}"\` |`)
  return [`| ${header} | Value |`, '|---|---|', ...rows].join('\n')
}

function buildInterfaceTable(fields: InterfaceField[]): string {
  const rows = fields.map((f) => {
    const name = f.optional ? `\`${f.name}\`` : `\`${f.name}\``
    const type = `\`${f.type.replace(/\|/g, '\\|')}\``
    return `| ${name} | ${type} | ${f.description} |`
  })
  return ['| Field | Type | Description |', '|---|---|---|', ...rows].join('\n')
}

function buildTooltipTip(fields: InterfaceField[]): string {
  return fields
    .map((f) => {
      const opt = f.optional ? '?' : ''
      return `${f.name}${opt}: ${f.type}`
    })
    .join('; ')
}

function buildTooltip(name: string, fields: InterfaceField[], prose: string): string {
  const tip = buildTooltipTip(fields)
  return `${prose} <Tooltip tip="${tip.replace(/"/g, '&quot;')}">\`${name}\`</Tooltip>.`
}

// ---------------------------------------------------------------------------
// Section replacement
// ---------------------------------------------------------------------------

function replaceSection(mdx: string, tag: string, content: string): string {
  const startMarker = `{/* <!-- GENERATED:${tag}:START --> */}`
  const endMarker = `{/* <!-- GENERATED:${tag}:END --> */}`

  const startIdx = mdx.indexOf(startMarker)
  const endIdx = mdx.indexOf(endMarker)
  if (startIdx === -1 || endIdx === -1)
    throw new Error(`Could not find GENERATED:${tag} markers in messages.mdx`)

  return mdx.slice(0, startIdx + startMarker.length)
    + '\n\n'
    + content
    + '\n\n'
    + mdx.slice(endIdx)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const sourceFile = ts.createSourceFile(
  DTS_PATH,
  readFileSync(DTS_PATH, 'utf-8'),
  ts.ScriptTarget.Latest,
  true,
)

const messageEffects = parseConstObject(sourceFile, 'MessageEffect')
const textEffects = parseConstObject(sourceFile, 'TextEffect')
const reactions = parseConstObject(sourceFile, 'Reaction')
const sendReceipt = parseInterface(sourceFile, 'SendReceipt')
const commandReceipt = parseInterface(sourceFile, 'CommandReceipt')
const sendOptions = parseInterface(sourceFile, 'SendOptions')
const messageListOptions = parseInterface(sourceFile, 'MessageListOptions')

let mdx = readFileSync(MDX_PATH, 'utf-8')

mdx = replaceSection(mdx, 'EFFECTS', [
  '<Accordion title="MessageEffect - full-screen and bubble effects">',
  '',
  buildEnumTable('Effect', messageEffects),
  '',
  '</Accordion>',
  '',
  '<Accordion title="TextEffect - per-character text animations (iOS 18+)">',
  '',
  buildEnumTable('Effect', textEffects),
  '',
  '</Accordion>',
].join('\n'))

mdx = replaceSection(mdx, 'REACTIONS', [
  '<Accordion title="All Reaction values">',
  '',
  buildEnumTable('Reaction', reactions),
  '',
  '</Accordion>',
].join('\n'))

mdx = replaceSection(mdx, 'SEND_RECEIPT',
  buildTooltip('SendReceipt', sendReceipt, 'All three methods return a'))

mdx = replaceSection(mdx, 'COMMAND_RECEIPT',
  buildTooltip('CommandReceipt', commandReceipt, 'All reaction methods return a'))

mdx = replaceSection(mdx, 'SEND_OPTIONS', [
  '<Accordion title="SendOptions reference">',
  '',
  buildInterfaceTable(sendOptions),
  '',
  '</Accordion>',
].join('\n'))

mdx = replaceSection(mdx, 'MESSAGE_LIST_OPTIONS', [
  '<Accordion title="MessageListOptions reference">',
  '',
  buildInterfaceTable(messageListOptions),
  '',
  '</Accordion>',
].join('\n'))

writeFileSync(MDX_PATH, mdx)
console.log([
  `Updated:`,
  `  ${messageEffects.length} MessageEffect, ${textEffects.length} TextEffect, ${reactions.length} Reaction`,
  `  ${sendReceipt.length} SendReceipt fields, ${commandReceipt.length} CommandReceipt fields`,
  `  ${sendOptions.length} SendOptions fields, ${messageListOptions.length} MessageListOptions fields`,
].join('\n'))
