import { InlayHint, InlayHintKind, type InlayHintParams } from 'vscode-languageserver'
import { printTokenValue } from '../tokens/utils'
import { tryCatch } from 'lil-fp/func'
import { onError } from '../tokens/error'
import type { PandaLanguageServer } from '../panda-language-server'
import { getRecipeInlayHints } from './recipe-inlay-hints'

export function registerInlayHints(lsp: PandaLanguageServer) {
  lsp.log('🐼 Registering inlay hints')
  
  // Register standard token inlay hints
  lsp.connection.languages.inlayHint.on(
    tryCatch(async (params: InlayHintParams) => {
      const settings = await lsp.getPandaSettings()
      if (!settings['inlay-hints.enabled']) return

      await lsp.isReady('🐼 inlay hints')

      // await when the server starts, then just get the context
      if (!lsp.getContext()) {
        await lsp.loadPandaContext(params.textDocument.uri)
      }

      const doc = lsp.documents.get(params.textDocument.uri)
      if (!doc) {
        return []
      }
      
      const inlayHints = [] as InlayHint[]
      
      // Get standard token inlay hints
      const parserResult = lsp.project.parseSourceFile(doc)
      if (parserResult) {
        lsp.tokenFinder.getFileTokens(parserResult, (match) => {
          if (
            match.kind === 'token' &&
            match.token.extensions.kind !== 'color' &&
            match.token.extensions.kind !== 'semantic-color' &&
            match.token.extensions.kind !== 'native-color' &&
            match.token.extensions.kind !== 'invalid-token-path'
          ) {
            inlayHints.push({
              position: match.range.end,
              label: printTokenValue(match.token, settings),
              kind: InlayHintKind.Type,
              paddingLeft: true,
            })
          }
        })
      }
      
      // Get recipe inlay hints
      const recipeHints = await getRecipeInlayHints(lsp, doc)
      inlayHints.push(...recipeHints)

      return inlayHints
    }, onError),
  )
}
