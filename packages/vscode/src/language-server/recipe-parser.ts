import { Range } from 'vscode-languageserver'
import { Node, SourceFile, SyntaxKind } from 'ts-morph'
import { TextDocument } from 'vscode-languageserver-textdocument'
import type { PandaContext } from '@pandacss/node'

export interface RecipeProperty {
  propName: string
  propValue: string
  range: Range
  slot?: string
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
  slots?: string[]
}

export class RecipeParser {
  constructor(private getContext: () => PandaContext | undefined) {}

  parseSourceFile(sourceFile: SourceFile): RecipeDefinition[] {
    // Find all defineRecipe and defineSlotRecipe call expressions
    const recipeNodes = this.findRecipeNodes(sourceFile);
    // Map nodes to recipe definitions
    return recipeNodes.map(({node, isSlotRecipe}) => 
      this.extractRecipeDefinition(node, isSlotRecipe)
    ).filter((recipe): recipe is RecipeDefinition => !!recipe);
  }
  
  private findRecipeNodes(sourceFile: SourceFile): {node: Node, isSlotRecipe: boolean}[] {
    return sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(node => {
        const expression = node.getExpression();
        if (!Node.isIdentifier(expression)) return false;
        
        const fnName = expression.getText();
        return fnName === 'defineRecipe' || fnName === 'defineSlotRecipe';
      })
      .map(node => {
        const expression = node.getExpression();
        return {
          node,
          isSlotRecipe: Node.isIdentifier(expression) && expression.getText() === 'defineSlotRecipe'
        };
      });
  }
  
  // Type guard utility to reduce repeated code
  private isPropertyWithObjectValue(prop: Node | undefined): prop is Node & { 
    getName(): string;
    getInitializer(): Node & { getProperties(): Node[] } 
  } {
    return !!prop && 
           Node.isPropertyAssignment(prop) && 
           !!prop.getInitializer() && 
           Node.isObjectLiteralExpression(prop.getInitializer());
  }
  
  private extractRecipeDefinition(
    callExpression: Node, 
    isSlotRecipe: boolean
  ): RecipeDefinition | undefined {
    
    const configArg = this.getConfigArgument(callExpression);
    if (!configArg) return undefined;
    
    // Extract all recipe components
    const name = this.extractRecipeName(callExpression, configArg);
    const slots = isSlotRecipe ? this.extractSlots(configArg) : [];
    const base = this.extractBase(configArg, isSlotRecipe);
    const variants = this.extractVariants(configArg, isSlotRecipe);
    const range = this.createRangeFromNode(callExpression);
    
    return {
      type: isSlotRecipe ? 'slotRecipe' : 'recipe',
      name: name || 'unnamedRecipe',
      base,
      variants,
      range,
      slots: isSlotRecipe ? slots : undefined
    };
  }
  
  private getConfigArgument(callExpression: Node): Node | undefined {
    if (!Node.isCallExpression(callExpression)) return undefined;
    
    const args = callExpression.getArguments();
    if (args.length === 0) return undefined;
    
    const configArg = args[0];
    return Node.isObjectLiteralExpression(configArg) ? configArg : undefined;
  }
  
  private extractRecipeName(callExpression: Node, configArg: Node): string {
    // Try to find name from parent variable declaration or export
    let parent = callExpression.getParent();
    let name = '';
    
    // Find name from variable declaration or property assignment
    while (parent && !name) {
      if (Node.isVariableDeclaration(parent)) {
        name = parent.getName();
        break;
      }
      
      if (Node.isPropertyAssignment(parent)) {
        name = parent.getName();
        break;
      }
      
      parent = parent.getParent();
    }
    
    // If no name found, try to find from className property
    if (!name && Node.isObjectLiteralExpression(configArg)) {
      const classNameProp = configArg.getProperty('className');
      if (classNameProp && Node.isPropertyAssignment(classNameProp)) {
        const initializer = classNameProp.getInitializer();
        if (initializer && Node.isStringLiteral(initializer)) {
          name = initializer.getLiteralValue();
        }
      }
    }
    
    return name;
  }
  
  private extractSlots(configArg: Node): string[] {
    if (!Node.isObjectLiteralExpression(configArg)) return [];
    
    const slotsProp = configArg.getProperty('slots');
    if (!slotsProp || !Node.isPropertyAssignment(slotsProp)) return [];
    
    const initializer = slotsProp.getInitializer();
    if (!initializer || !Node.isArrayLiteralExpression(initializer)) return [];
    
    return initializer.getElements()
      .filter(Node.isStringLiteral)
      .map(element => element.getLiteralValue());
  }
  
  private extractBase(configArg: Node, isSlotRecipe: boolean): RecipeBase {
    const base: RecipeBase = { properties: [] };
    
    if (!Node.isObjectLiteralExpression(configArg)) return base;
    
    const baseProp = configArg.getProperty('base');
    if (!Node.isPropertyAssignment(baseProp)) return base;
    
    const initializer = baseProp.getInitializer();
    if (!initializer || !Node.isObjectLiteralExpression(initializer)) return base;
    
    base.properties = isSlotRecipe
      ? this.extractSlotProperties(initializer)
      : this.extractProperties(initializer);
    
    return base;
  }
  
  private extractVariants(configArg: Node, isSlotRecipe: boolean): Record<string, RecipeVariant[]> {
    const variants: Record<string, RecipeVariant[]> = {};
    
    if (!Node.isObjectLiteralExpression(configArg)) return variants;
    
    const variantsProp = configArg.getProperty('variants');
    if (!Node.isPropertyAssignment(variantsProp)) return variants;
    
    const initializer = variantsProp.getInitializer();
    if (!initializer || !Node.isObjectLiteralExpression(initializer)) return variants;
    
    // Get all properties that are property assignments
    const variantGroups = initializer.getProperties()
      .filter(Node.isPropertyAssignment);
    
    // Process each variant group in a functional way
    variantGroups.forEach(prop => {
      const variantGroupName = prop.getName();
      const variantGroupValue = prop.getInitializer();
      
      if (!variantGroupValue || !Node.isObjectLiteralExpression(variantGroupValue)) return;
      
      const variantValues = this.processVariantValues(variantGroupValue, isSlotRecipe);
      if (variantValues.length > 0) {
        variants[variantGroupName] = variantValues;
      }
    });
    
    return variants;
  }
  
  private processVariantValues(variantGroupValue: Node, isSlotRecipe: boolean): RecipeVariant[] {
    if (!Node.isObjectLiteralExpression(variantGroupValue)) return [];
    
    return variantGroupValue.getProperties()
      .filter(Node.isPropertyAssignment)
      .map(variantProp => {
        const variantName = variantProp.getName();
        const variantValue = variantProp.getInitializer();
        
        if (!variantValue || !Node.isObjectLiteralExpression(variantValue)) return null;
        
        const properties = isSlotRecipe 
          ? this.extractSlotProperties(variantValue)
          : this.extractProperties(variantValue);
          
        return properties.length === 0 ? null : { name: variantName, properties };
      })
      .filter((variant): variant is RecipeVariant => variant !== null);
  }
  
  private extractSlotProperties(obj: Node): RecipeProperty[] {
    if (!Node.isObjectLiteralExpression(obj)) return [];
    
    return obj.getProperties()
      .filter(Node.isPropertyAssignment)
      .flatMap(slotProp => {
        const slotName = slotProp.getName();
        const slotValue = slotProp.getInitializer();
        
        if (!slotValue || !Node.isObjectLiteralExpression(slotValue)) return [];
        
        // Extract properties for this slot and add slot information
        return this.extractProperties(slotValue)
          .map(prop => ({ ...prop, slot: slotName }));
      });
  }
  
  private extractProperties(obj: Node): RecipeProperty[] {
    if (!Node.isObjectLiteralExpression(obj)) return [];
    
    return obj.getProperties()
      .filter(Node.isPropertyAssignment)
      .flatMap(prop => {
        const propName = prop.getName();
        const initializer = prop.getInitializer();
        
        if (!initializer) return [];
        
        // Handle string or numeric literals
        if (Node.isStringLiteral(initializer) || Node.isNumericLiteral(initializer)) {
          return [{
            propName,
            propValue: Node.isStringLiteral(initializer) 
              ? initializer.getLiteralValue() 
              : initializer.getText(),
            range: this.createRangeFromNode(initializer)
          }];
        } 
        
        // Handle nested objects
        if (Node.isObjectLiteralExpression(initializer)) {
          return this.extractProperties(initializer)
            .map(nestedProp => ({
              propName: nestedProp.propName,
              propValue: nestedProp.propValue,
              range: nestedProp.range
            }));
        }
        
        return [];
      });
  }
  
  private createRangeFromNode(node: Node): Range {
    const sourceFile = node.getSourceFile();
    const start = node.getPos();
    const end = node.getEnd();
    
    const startLineAndChar = sourceFile.getLineAndColumnAtPos(start);
    const endLineAndChar = sourceFile.getLineAndColumnAtPos(end);
    
    return Range.create(
      { 
        line: startLineAndChar.line - 1, 
        character: startLineAndChar.column - 1
      },
      { 
        line: endLineAndChar.line - 1, 
        character: endLineAndChar.column - 1
      }
    );
  }
  
  parseDocument(doc: TextDocument): RecipeDefinition[] {
    const ctx = this.getContext();
    if (!ctx) return [];
    
    const sourceFile = ctx.project.getSourceFile(doc.uri) as SourceFile | undefined;
    if (!sourceFile || sourceFile.getFullText().trim() === '') return [];
    
    return this.parseSourceFile(sourceFile);
  }
} 