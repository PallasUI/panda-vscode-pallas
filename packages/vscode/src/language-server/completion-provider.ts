import { CompletionItem, CompletionItemKind, Position } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { type PandaVSCodeSettings } from '@pandacss/extension-shared'
import { BoxNodeLiteral, box } from '@pandacss/extractor'
import { type PandaContext } from '@pandacss/node'
import { traverse } from '@pandacss/shared'
import { type Token } from '@pandacss/token-dictionary'
import { getReferences, hasCurlyReference, hasTokenFnReference } from './tokens/expand-token-fn'
import { makeColorTile, makeTable } from './tokens/render-markdown'
import { getSortText } from './tokens/sort-text'
import { getMarkdownCss, printTokenValue } from './tokens/utils'
import type { GetContext } from './panda-language-server'
import type { ProjectHelper } from './project-helper'
import type { TokenFinder } from './token-finder'

export class CompletionProvider {
  constructor(
    private getContext: GetContext,
    private getPandaSettings: () => Promise<PandaVSCodeSettings>,
    private project: ProjectHelper,
    private tokenFinder: TokenFinder,
  ) {}

  async getClosestCompletionList(doc: TextDocument, position: Position) {
    const ctx = this.getContext()
    if (!ctx) return

    const match = this.project.getNodeAtPosition(doc, position)
    if (!match) return

    const settings = await this.getPandaSettings()
    const { node, stack } = match

    try {
      return this.tokenFinder.findClosestToken(node, stack, ({ propName, propNode, shorthand }) => {
        if (!box.isLiteral(propNode)) return undefined
        return getCompletionFor({ ctx, propName, propValue: propNode.value, settings, shorthand })
      })
    } catch (err) {
      console.error(err)
      console.trace()
      return
    }
  }

  async getCompletionDetails(item: CompletionItem) {
    const ctx = this.getContext()
    if (!ctx) return

    const settings = await this.getPandaSettings()
    const { propName, token, shorthand } = (item.data ?? {}) as { propName: string; token?: Token; shorthand: string }
    if (!token) return
    const markdownCss = await getMarkdownCss(ctx, { [propName]: token.value }, settings)

    const markdown = [markdownCss.withCss]
    if (shorthand !== propName) {
      markdown.push(`\`${shorthand}\` is shorthand for \`${propName}\``)
    }

    const conditions = token.extensions.conditions ?? { base: token.value }
    if (conditions) {
      const separator = '[___]'
      const table = [{ color: ' ', theme: 'Condition', value: 'Value' }]

      const tab = '&nbsp;&nbsp;&nbsp;&nbsp;'
      traverse(
        conditions,
        ({ key: cond, value, depth }) => {
          if (!ctx.conditions.get(cond) && cond !== 'base') return

          const indent = depth > 0 ? tab.repeat(depth) + '├ ' : ''

          if (typeof value === 'object') {
            table.push({
              color: '',
              theme: `${indent}**${cond}**`,
              value: '─────',
            })
            return
          }

          const [tokenRef] = ctx.tokens.getReferences(value)
          const color = tokenRef?.value ?? value
          if (!color) return

          table.push({
            color: makeColorTile(color),
            theme: `${indent}**${cond}**`,
            value: `\`${color}\``,
          })
        },
        { separator },
      )

      markdown.push(makeTable(table))
      markdown.push(`\n${tab}`)
    }

    item.documentation = { kind: 'markdown', value: markdown.join('\n') }
  }
}

export const getCompletionFor = ({
  ctx,
  propName,
  shorthand,
  propValue,
  settings,
}: {
  ctx: PandaContext
  propName: string
  shorthand?: string
  propValue: BoxNodeLiteral['value']
  settings: PandaVSCodeSettings
}) => {
  let str = String(propValue)
  let category: string | undefined

  // also provide completion in string such as: token('colors.blue.300')
  if (settings['completions.token-fn.enabled'] && (hasTokenFnReference(str) || hasCurlyReference(str))) {
    const matches = getReferences(str)
    const tokenPath = matches[2] ?? ''
    const split = tokenPath.split('.').filter(Boolean)

    // provide completion for token category when token() is empty or partial
    if (split.length < 1) {
      return Array.from(ctx.tokens.view.categoryMap.keys()).map((category) => {
        return {
          label: category,
          kind: CompletionItemKind.EnumMember,
          sortText: '-' + category,
          preselect: true,
        } as CompletionItem
      })
    }

    str = tokenPath.split('.').slice(1).join('.')
    category = split[0]
  }

  // token(colors.red.300) -> category = "colors"
  // color="red.300" -> no category, need to find it
  let propValues: Record<string, string> | undefined
  if (!category) {
    const utility = ctx.config.utilities?.[propName]
    if (!utility?.values) return

    // values: "spacing"
    if (typeof utility?.values === 'string') {
      category = utility.values
    } else if (typeof utility.values === 'function') {
      // values: (theme) => { ...theme("spacing") }
      const record = ctx.utility.getPropertyValues(utility, (key) => {
        return `types:Tokens["${key}"]`
      })
      if (record) {
        if (record.type) {
          category = record.type as string
        } else {
          const newRecord: Record<string, string> = {}
          // itterate through record keys and extract sub values if they are present
          Object.entries(record as Record<string, string | {}>).forEach(([name, value]) => {
            if (typeof value === 'string') {
              newRecord[name] = value
              return
            }
            // flatten token
            Object.entries(value as Record<string, string>).forEach(([subName, subValue]) => {
              newRecord[subName] = subValue
            })
            return
          })
          propValues = newRecord
        }
      }
    }
  }

  // values: { "1": "1px", "2": "2px", ... }
  if (propValues) {
    const items = [] as CompletionItem[]
    Object.entries(propValues).map(([name, value]) => {
      // margin: "2" -> ['var(--spacing-2)', 'var(--spacing-12)', 'var(--spacing-20)', ...]
      if (str && !name.includes(str)) return

      const tokenPath = matchVar(value ?? '')?.replace('-', '.')
      const token = tokenPath && ctx.tokens.getByName(tokenPath)

      items.push({
        data: { propName, token, shorthand },
        label: name,
        kind: CompletionItemKind.EnumMember,
        sortText: '-' + getSortText(name),
        preselect: false,
      })
    })

    return items
  }

  if (!category) return []

  const categoryValues = ctx.tokens.view.categoryMap.get(category as any)
  if (!categoryValues) return []

  const items = [] as CompletionItem[]
  categoryValues.forEach((token, name) => {
    if (str && !name.includes(str)) return

    const isColor = token.extensions.category === 'colors'

    let insertText = name
    if (str) {
      const strEndsWithDot = str.endsWith('.')
      if (strEndsWithDot) {
        insertText = name.startsWith(str) ? name.substring(str.length) : name
      }
    }

    const completionItem = {
      data: { propName, token, shorthand },
      label: name,
      insertText,
      kind: isColor ? CompletionItemKind.Color : CompletionItemKind.EnumMember,
      labelDetails: { description: printTokenValue(token, settings), detail: `   ${token.extensions.varRef}` },
      sortText: '-' + getSortText(name),
      preselect: false,
    } as CompletionItem

    if (isColor) {
      completionItem.detail = token.value
      // TODO rgb conversion ?
    }

    items.push(completionItem)
  })

  return items
}
const cssVarRegex = /var\(--([\w-.]+)\)/g
const matchVar = (str: string) => {
  const match = cssVarRegex.exec(str)
  return match ? match[1] : null
}
