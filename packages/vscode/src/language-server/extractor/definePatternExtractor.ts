import type { ParserOptions } from '@pandacss/core'
import type { SourceFile } from 'ts-morph'
import { Node } from 'ts-morph'

/**
 * A pattern extracted from a defineRecipe or defineSlotRecipe call
 */
export interface DefineRecipePattern {
  type: 'defineRecipe' | 'defineSlotRecipe';
  name: string;
  // The raw object that was passed to the function
  config: Record<string, any>;
  // Source location information
  source: {
    filePath: string;
    line: number;
    column: number;
  };
}

/**
 * Extracts defineRecipe and defineSlotRecipe patterns from source files
 * This provides a more direct approach than the full parser for simple scanning
 * 
 * @param sourceFile The source file to analyze
 * @param _context Parser context (unused in this implementation)
 * @returns Array of extracted define recipe patterns
 */
export function extractDefinePatterns(
  sourceFile: SourceFile | undefined,
  _context: ParserOptions
): DefineRecipePattern[] {
  if (!sourceFile) return []
  
  // Quick check if the file potentially contains defineRecipe patterns
  if (!hasDefineRecipePatterns(sourceFile)) return []
  
  const patterns: DefineRecipePattern[] = []
  const filePath = sourceFile.getFilePath()
  
  // Find all call expressions in the file
  sourceFile.forEachDescendant(node => {
    if (Node.isCallExpression(node)) {
      const expression = node.getExpression()
      
      // Check if the call is to defineRecipe or defineSlotRecipe
      if (Node.isIdentifier(expression)) {
        const functionName = expression.getText()
        
        if (functionName === 'defineRecipe' || functionName === 'defineSlotRecipe') {
          const args = node.getArguments()
          
          // Get the first argument (config object)
          if (args.length > 0) {
            const configArg = args[0]
            const config: Record<string, any> = {}
            
            // Try to extract the config as a simple object
            if (Node.isObjectLiteralExpression(configArg)) {
              const properties = configArg.getProperties()
              
              for (const prop of properties) {
                if (Node.isPropertyAssignment(prop)) {
                  const name = prop.getName()
                  const initializer = prop.getInitializer()
                  
                  if (initializer) {
                    // For this simplified example, just store the text representation
                    config[name] = initializer.getText()
                  }
                }
              }
              
              // If there's a name property in the config, use it as the recipe name
              // Otherwise use a default name
              const recipeName = config.name?.toString() || 'unnamedRecipe'
              
              // Get source location
              const start = node.getStart()
              const { line, column } = sourceFile.getLineAndColumnAtPos(start)
              
              patterns.push({
                type: functionName === 'defineRecipe' ? 'defineRecipe' : 'defineSlotRecipe',
                name: recipeName,
                config,
                source: {
                  filePath,
                  line,
                  column
                }
              })
            }
          }
        }
      }
    }
  })
  
  return patterns
}

/**
 * Determines if a source file potentially contains defineRecipe or defineSlotRecipe patterns
 * by checking imports first (for optimization)
 * 
 * @param sourceFile The source file to check
 * @returns true if the file has relevant imports
 */
export function hasDefineRecipePatterns(sourceFile: SourceFile | undefined): boolean {
  if (!sourceFile) return false
  
  // Check imports first for efficiency
  const hasDefineImports = sourceFile.getImportDeclarations().some(importDecl => {
    const moduleSpecifier = importDecl.getModuleSpecifierValue()
    
    // Look for imports from modules that might export these functions
    if (
      moduleSpecifier.includes('@pandacss/recipes') || 
      moduleSpecifier.includes('@pandacss') ||
      moduleSpecifier.includes('panda')
    ) {
      // Check for named imports
      return importDecl.getNamedImports().some(namedImport => {
        const name = namedImport.getName()
        return name === 'defineRecipe' || name === 'defineSlotRecipe'
      })
    }
    
    return false
  })
  
  return hasDefineImports
} 