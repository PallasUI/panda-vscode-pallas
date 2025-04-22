import { InlayHint, InlayHintKind } from 'vscode-languageserver'
import { printTokenValue } from '../tokens/utils'
import type { PandaLanguageServer } from '../panda-language-server'
import { RecipeParser, type RecipeProperty } from '../recipe-parser'
import { getTokenFromPropValue } from '../tokens/get-token'
import { TextDocument } from 'vscode-languageserver-textdocument'
import type { PandaContext } from '@pandacss/node'
import type { PandaVSCodeSettings } from '@pandacss/extension-shared'
import type { Token } from '@pandacss/token-dictionary'

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
  
  // Create and return inlay hints
  return recipes.flatMap(recipe => [
    // Process base properties
    ...createHints(recipe.base.properties, ctx, settings),
    
    // Process variant properties (flatMap all variant groups and their values)
    ...Object.values(recipe.variants)
      .flatMap(variantGroup => 
        variantGroup.flatMap(variant => 
          createHints(variant.properties, ctx, settings)
        )
      )
  ]);
}

/**
 * Helper function to create inlay hints from recipe properties
 */
function createHints(
  properties: RecipeProperty[], 
  ctx: PandaContext, 
  settings: PandaVSCodeSettings
): InlayHint[] {
  return properties
    .map(prop => {
      const token = getTokenFromPropValue(ctx, prop.propName, String(prop.propValue))
      
      if (!token || !isValidTokenForHint(token)) {
        return null
      }
      
      // Create label with slot information if available
      const label = printTokenValue(token, settings)
        
      return {
        position: prop.range.end,
        label,
        kind: InlayHintKind.Type,
        paddingLeft: true,
      } as InlayHint
    })
    .filter((hint): hint is InlayHint => hint !== null)
}

/**
 * Check if the token is valid for showing an inlay hint
 */
function isValidTokenForHint(token: Token): boolean {
  return token.extensions.kind !== 'color' &&
         token.type !== 'color' &&
         token.extensions.kind !== 'semantic-color' &&
         token.extensions.kind !== 'native-color' &&
         token.extensions.kind !== 'invalid-token-path'
} 