import { InlayHint, InlayHintKind } from 'vscode-languageserver'
import { printTokenValue } from '../tokens/utils'
import type { PandaLanguageServer } from '../panda-language-server'
import { RecipeParser } from '../recipe-parser'
import { getTokenFromPropValue } from '../tokens/get-token'
import { TextDocument } from 'vscode-languageserver-textdocument'

/**
 * Gets recipe inlay hints for a document
 */
export async function getRecipeInlayHints(
  lsp: PandaLanguageServer, 
  doc: TextDocument
): Promise<InlayHint[]> {
  const settings = await lsp.getPandaSettings()
  if (!settings['inlay-hints.enabled']) return []

  // Get context
  const ctx = lsp.getContext()
  if (!ctx) return []
  
  // Create recipe parser
  const recipeParser = new RecipeParser(lsp.getContext)
  
  // Parse recipes from the document
  const recipes = recipeParser.parseDocument(doc)
  
  // No recipes found
  if (!recipes.length) {
    return []
  }
  
  const inlayHints = [] as InlayHint[]
  
  // Process each recipe
  recipes.forEach(recipe => {
    // Process base properties
    recipe.base.properties.forEach(prop => {
      const token = getTokenFromPropValue(ctx, prop.propName, String(prop.propValue))
      if (token && 
          token.extensions.kind !== 'color' &&
          token.extensions.kind !== 'semantic-color' &&
          token.extensions.kind !== 'native-color' &&
          token.extensions.kind !== 'invalid-token-path') {
        inlayHints.push({
          position: prop.range.end,
          label: printTokenValue(token, settings),
          kind: InlayHintKind.Type,
          paddingLeft: true,
        })
      }
    })
    
    // Process variant properties
    Object.values(recipe.variants).forEach(variantGroup => {
      variantGroup.forEach(variant => {
        variant.properties.forEach(prop => {
          const token = getTokenFromPropValue(ctx, prop.propName, String(prop.propValue))
          if (token && 
              token.extensions.kind !== 'color' &&
              token.extensions.kind !== 'semantic-color' &&
              token.extensions.kind !== 'native-color' && 
              token.extensions.kind !== 'invalid-token-path') {
            inlayHints.push({
              position: prop.range.end,
              label: printTokenValue(token, settings),
              kind: InlayHintKind.Type,
              paddingLeft: true,
            })
          }
        })
      })
    })
  })
  
  return inlayHints
} 