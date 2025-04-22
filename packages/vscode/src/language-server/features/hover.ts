import { getMarkdownCss, nodeRangeToVsCodeRange, printTokenValueHover } from '../tokens/utils'
import { renderTokenColorPreviewV2 } from '../tokens/render-token-color-preview'
import { stringify } from '@pandacss/core'
import { tryCatch } from 'lil-fp/func'
import { onError } from '../tokens/error'
import type { PandaLanguageServer } from '../panda-language-server'

export function registerHover(lsp: PandaLanguageServer) {
  lsp.log('🐼 Registering hover')
  lsp.connection.onHover(
    tryCatch(async (params) => {
      const settings = await lsp.getPandaSettings()
      if (!settings['hovers.enabled']) return

      await lsp.isReady('🐼 onHover')

      const ctx = lsp.getContext()
      if (!ctx) return

      const doc = lsp.documents.get(params.textDocument.uri)
      if (!doc) {
        return
      }
      lsp.log(settings)
      if (settings['hovers.tokens.enabled']) {
        // TODO recipe
        const tokenMatch = lsp.tokenFinder.getClosestToken(doc, params.position)
        lsp.log(tokenMatch)
        if (tokenMatch) {
          if (tokenMatch.kind === 'token') {
            const { token } = tokenMatch

            const contents = [printTokenValueHover(ctx, token, settings)] as any[]
            if (settings['hovers.tokens.css-preview.enabled']) {
              const css = (await getMarkdownCss(ctx, { [tokenMatch.propName]: token.value }, settings)).raw
              contents.push({ language: 'css', value: css })
            }

            const category = token.extensions.category

            if (category === 'colors' && settings['hovers.semantic-colors.enabled']) {
              const preview = renderTokenColorPreviewV2(ctx, token, tokenMatch.propName, tokenMatch.shorthand)
              if (preview) {
                contents.push(preview)
              }
            }

            if (category === 'animations' && token.extensions.prop) {
              const sheet = ctx.createSheet()
              ctx.appendCssOfType('keyframes', sheet)
              const keyframes = ctx.config.theme?.keyframes?.[token.extensions.prop]
              if (keyframes) {
                const keyframeCss = stringify(sheet.serialize({ ['@keyframes ' + token.extensions.prop]: keyframes }))
                contents.push({ language: 'css', value: keyframeCss })
              }
            }

            return { contents, range: tokenMatch.range }
          }

          if (tokenMatch.kind === 'condition' && settings['hovers.conditions.enabled']) {
            const { condition, propValue, propName } = tokenMatch
            const css = (await getMarkdownCss(ctx, { [propName]: propValue }, settings)).raw

            return {
              contents: [`🐼 \`${condition.value}\``, { language: 'css', value: css }],
              range: tokenMatch.range,
            }
          }
        }
      }

      if (settings['hovers.instances.enabled']) {
        const instanceMatch = lsp.tokenFinder.getClosestInstance(doc, params.position)
        if (instanceMatch && instanceMatch.kind === 'styles') {
          const range = nodeRangeToVsCodeRange(instanceMatch.props.getRange())
          return { contents: (await getMarkdownCss(ctx, instanceMatch.styles, settings)).withCss, range }
        }
      }
    }, onError),
  )
}
