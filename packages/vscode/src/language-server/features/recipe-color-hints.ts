import { ColorInformation } from 'vscode-languageserver'
import { color2kToVsCodeColor } from '../tokens/color2k-to-vscode-color'
import type { PandaLanguageServer } from '../panda-language-server'
import { RecipeParser, type RecipeProperty } from '../recipe-parser'
import { getTokenFromPropValue } from '../tokens/get-token'
import { TextDocument } from 'vscode-languageserver-textdocument'
import type { PandaContext } from '@pandacss/node'
import type { Token } from '@pandacss/token-dictionary'

/**
 * Gets color hints for recipes in a document
 */
export async function getRecipeColorHints(
  lsp: PandaLanguageServer, 
  doc: TextDocument
): Promise<ColorInformation[]> {
  const settings = await lsp.getPandaSettings()
  if (!settings['color-hints.enabled']) return []

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
  
  // Create and return color hints
  return recipes.flatMap(recipe => [
    // Process base properties
    ...createColorHints(recipe.base.properties, ctx, settings),
    
    // Process variant properties (flatMap all variant groups and their values)
    ...Object.values(recipe.variants)
      .flatMap(variantGroup => 
        variantGroup.flatMap(variant => 
          createColorHints(variant.properties, ctx, settings)
        )
      )
  ]);
}

/**
 * Helper function to create color hints from recipe properties
 */
export function createColorHints(
  properties: RecipeProperty[],
  ctx: PandaContext,
  settings: any
): ColorInformation[] {
  return properties
    .flatMap(prop => {
      const token = getTokenFromPropValue(ctx, prop.propName, String(prop.propValue))
      
      if (!token) return []
      
      // Handle semantic tokens with conditions
      if (token.extensions.conditions && settings['color-hints.semantic-tokens.enabled']) {
        return processSemanticToken(token, prop, ctx);
      }
      
      // Handle regular color tokens
      if (isColorToken(token)) {
        return [{
          color: token.extensions.vscodeColor,
          range: prop.range
        }];
      }
      
      return [];
    });
}

/**
 * Process a semantic token to extract color information
 */
export function processSemanticToken(
  token: Token, 
  prop: RecipeProperty, 
  ctx: PandaContext
): ColorInformation[] {
  const colorInfos: ColorInformation[] = [];
  
  // Handle case when conditions don't exist
  if (!token.extensions.conditions) return colorInfos;
  
  // Process each condition in the token
  Object.entries(token.extensions.conditions).forEach(([cond, value]) => {
    // Skip conditions that don't exist (except base)
    if (cond !== 'base' && !ctx.conditions.get(cond)) return;
    if(cond !== 'base') return
    
    const valueToResolve = token.isReference ? token.originalValue : value;
    const resolvedValue = ctx.tokens.deepResolveReference(valueToResolve);
    // Try to get the actual color value
    try {
      // For direct color values
      if (resolvedValue && typeof resolvedValue === 'string') { 
        // If we reach here, it's a valid color
        const color = color2kToVsCodeColor(resolvedValue);
        if (color) {
          colorInfos.push({
            color,
            range: prop.range
          });
        }
      }
      
    } catch (e) {
      // Not a valid color, ignore
    }
  });
  
  return colorInfos;
}

/**
 * Check if the token is a color token
 */
function isColorToken(token: Token): boolean {
  return !!token.extensions?.vscodeColor
} 