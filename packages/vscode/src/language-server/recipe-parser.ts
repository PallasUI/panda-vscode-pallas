import { Range } from 'vscode-languageserver'
import { Node, SourceFile } from 'ts-morph'
import { TextDocument } from 'vscode-languageserver-textdocument'
import type { PandaContext } from '@pandacss/node'

export interface RecipeProperty {
  propName: string
  propValue: string
  range: Range
}

export interface RecipeVariant {
  name: string
  properties: RecipeProperty[]
}

export interface RecipeBase {
  properties: RecipeProperty[]
}

export interface RecipeDefinition {
  type: 'recipe' | 'slotRecipe'
  name: string
  base: RecipeBase
  variants: Record<string, RecipeVariant[]>
  range: Range
}

export class RecipeParser {
  constructor(private getContext: () => PandaContext | undefined) {}

  parseSourceFile(sourceFile: SourceFile): RecipeDefinition[] {
    const recipes: RecipeDefinition[] = []
    
    // Directly search for all defineRecipe and defineSlotRecipe call expressions
    sourceFile.forEachDescendant(node => {
      if (Node.isCallExpression(node)) {
        const expression = node.getExpression()
        if (Node.isIdentifier(expression)) {
          const fnName = expression.getText()
          
          if (fnName === 'defineRecipe' || fnName === 'defineSlotRecipe') {
            const recipe = this.extractRecipeDefinition(node, fnName === 'defineSlotRecipe')
            if (recipe) {
              recipes.push(recipe)
            }
          }
        }
      }
    })
    
    return recipes
  }
  
  private extractRecipeDefinition(
    callExpression: Node, 
    isSlotRecipe: boolean
  ): RecipeDefinition | undefined {
    if (!Node.isCallExpression(callExpression)) return undefined
    
    // Get the first argument (config object)
    const args = callExpression.getArguments()
    if (args.length === 0) return undefined
    
    const configArg = args[0]
    if (!Node.isObjectLiteralExpression(configArg)) return undefined
    
    // Get the recipe name - first try to find from parent variable declaration or export
    let name = this.findRecipeNameFromParent(callExpression)
    
    // Find className property if present
    const classNameProp = configArg.getProperty('className')
    if (classNameProp && Node.isPropertyAssignment(classNameProp)) {
      const initializer = classNameProp.getInitializer()
      if (initializer && Node.isStringLiteral(initializer)) {
        name = initializer.getLiteralValue()
      }
    }
    
    // Get the base styles
    const base: RecipeBase = { properties: [] }
    const baseProp = configArg.getProperty('base')
    if (baseProp && Node.isPropertyAssignment(baseProp)) {
      const initializer = baseProp.getInitializer()
      if (initializer && Node.isObjectLiteralExpression(initializer)) {
        base.properties = this.extractProperties(initializer)
      }
    }
    
    // Get the variants
    const variants: Record<string, RecipeVariant[]> = {}
    const variantsProp = configArg.getProperty('variants')
    if (variantsProp && Node.isPropertyAssignment(variantsProp)) {
      const initializer = variantsProp.getInitializer()
      if (initializer && Node.isObjectLiteralExpression(initializer)) {
        // Each property in variants is a variant group (like size, color, etc.)
        initializer.getProperties().forEach(prop => {
          if (Node.isPropertyAssignment(prop)) {
            const variantGroupName = prop.getName()
            const variantGroupValue = prop.getInitializer()
            
            if (variantGroupValue && Node.isObjectLiteralExpression(variantGroupValue)) {
              // Each property in this object is a variant value (sm, md, lg, etc.)
              const variantValues: RecipeVariant[] = []
              
              variantGroupValue.getProperties().forEach(variantProp => {
                if (Node.isPropertyAssignment(variantProp)) {
                  const variantName = variantProp.getName()
                  const variantValue = variantProp.getInitializer()
                  
                  if (variantValue && Node.isObjectLiteralExpression(variantValue)) {
                    variantValues.push({
                      name: variantName,
                      properties: this.extractProperties(variantValue)
                    })
                  }
                }
              })
              
              if (variantValues.length > 0) {
                variants[variantGroupName] = variantValues
              }
            }
          }
        })
      }
    }
    
    // Create range from node position
    const sourceFile = callExpression.getSourceFile();
    const start = callExpression.getPos();
    const end = callExpression.getEnd();
    
    const startLineAndChar = sourceFile.getLineAndColumnAtPos(start);
    const endLineAndChar = sourceFile.getLineAndColumnAtPos(end);
    
    const range = Range.create(
      { 
        line: startLineAndChar.line - 1, 
        character: startLineAndChar.column - 1
      },
      { 
        line: endLineAndChar.line - 1, 
        character: endLineAndChar.column - 1
      }
    );
    
    return {
      type: isSlotRecipe ? 'slotRecipe' : 'recipe',
      name: name || 'unnamedRecipe',
      base,
      variants,
      range
    }
  }
  
  private findRecipeNameFromParent(callExpression: Node): string {
    // Try to find the parent variable declaration to get the name
    let parent = callExpression.getParent();
    
    while (parent) {
      // Check for variable declaration (const button = defineRecipe(...))
      if (Node.isVariableDeclaration(parent)) {
        return parent.getName();
      }
      
      // Check for property assignment (export = { button: defineRecipe(...) })
      if (Node.isPropertyAssignment(parent)) {
        return parent.getName();
      }
      
      parent = parent.getParent();
    }
    
    return '';
  }
  
  private extractProperties(obj: Node): RecipeProperty[] {
    const properties: RecipeProperty[] = []
    
    if (Node.isObjectLiteralExpression(obj)) {
      obj.getProperties().forEach(prop => {
        if (Node.isPropertyAssignment(prop)) {
          const propName = prop.getName()
          const initializer = prop.getInitializer()
          
          if (initializer) {
            // For string literals we capture the value and position
            if (Node.isStringLiteral(initializer) || Node.isNumericLiteral(initializer)) {
              // Create range from node position
              const sourceFile = initializer.getSourceFile();
              const start = initializer.getPos();
              const end = initializer.getEnd();
              
              const startLineAndChar = sourceFile.getLineAndColumnAtPos(start);
              const endLineAndChar = sourceFile.getLineAndColumnAtPos(end);
              
              const range = Range.create(
                { 
                  line: startLineAndChar.line - 1, 
                  character: startLineAndChar.column - 1
                },
                { 
                  line: endLineAndChar.line - 1, 
                  character: endLineAndChar.column - 1
                }
              );
              
              properties.push({
                propName,
                propValue: Node.isStringLiteral(initializer) 
                  ? initializer.getLiteralValue() 
                  : initializer.getText(),
                range
              })
            } 
            // For nested objects recursively extract properties
            else if (Node.isObjectLiteralExpression(initializer)) {
              const nestedProps = this.extractProperties(initializer)
              // Prefix the nested property names with the parent property name
              nestedProps.forEach(nestedProp => {
                properties.push({
                  propName: `${propName}.${nestedProp.propName}`,
                  propValue: nestedProp.propValue,
                  range: nestedProp.range
                })
              })
            }
          }
        }
      })
    }
    
    return properties
  }
  
  parseDocument(doc: TextDocument): RecipeDefinition[] {
    const ctx = this.getContext()
    if (!ctx) return []
    
    const sourceFile = ctx.project.getSourceFile(doc.uri) as SourceFile | undefined
    if (!sourceFile) return []
    
    return this.parseSourceFile(sourceFile)
  }
} 