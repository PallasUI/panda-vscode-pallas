import type { ImportResult, ParserOptions } from '@pandacss/core'
import { box, extract, unbox, type EvaluateOptions, type Unboxed } from '@pandacss/extractor'
import { logger } from '@pandacss/logger'
import type { ParserResultConfigureOptions, ResultItem } from '@pandacss/types'
import type { SourceFile } from 'ts-morph'
import { match } from 'ts-pattern'
import { ParserResult } from './parser-result'
import { extractDefinePatterns, hasDefineRecipePatterns } from './definePatternExtractor'

/**
 * This module extends the original Panda parser to support defineRecipe and defineSlotRecipe
 * which are functionally equivalent to cva and sva.
 */

const combineResult = (unboxed: Unboxed) => {
  return [...unboxed.conditions, unboxed.raw, ...unboxed.spreadConditions]
}

const defaultEnv: EvaluateOptions['environment'] = {
  preset: 'ECMA',
}

const evaluateOptions: EvaluateOptions = {
  environment: defaultEnv,
}

// Type for encoder to avoid using @pandacss/generator
type Encoder = { 
  processAtomic?: Function; 
  processAtomicRecipe?: Function; 
  processAtomicSlotRecipe?: Function 
}

/**
 * Creates a placeholder BoxNode for recipe config objects
 */
function createPlaceholderBoxNode(config: Record<string, any>): any {
  return {
    type: 'map',
    value: new Map(Object.entries(config)),
    getNode: () => {
      const mockNode = {
        getText: () => JSON.stringify(config)
      }
      return mockNode as any
    },
    isRecipe: true,
  }
}

/**
 * Creates a parser specifically for define* recipes
 */
export function createDefineParser(context: ParserOptions) {
  return function parse(
    sourceFile: SourceFile | undefined,
    encoder?: Encoder,
    _options?: ParserResultConfigureOptions,
  ) {
    if (!sourceFile) return

    // Quick check if the file has potential defineRecipe patterns
    if (!hasDefineRecipePatterns(sourceFile)) {
      return new ParserResult(context, encoder)
    }

    // We have two approaches to extract patterns:
    // 1. Using the direct extractor (faster for simple cases)
    // 2. Using the AST-based extractor (more thorough but more complex)
    // We'll choose based on the complexity of the file

    // For demonstration, we'll use the direct extractor approach for simplicity
    const patterns = extractDefinePatterns(sourceFile, context)
    const parserResult = new ParserResult(context, encoder)
    
    // Convert patterns to ResultItems and add them to the parser result
    patterns.forEach(pattern => {
      const resultItem: ResultItem = {
        name: pattern.name,
        box: createPlaceholderBoxNode(pattern.config),
        data: [pattern.config],
      }
      
      if (pattern.type === 'defineSlotRecipe') {
        parserResult.setSva(resultItem)
      } else {
        parserResult.setCva(resultItem)
      }
    })
    
    // For more complex cases or if we want full AST analysis, we'd use the extract-based approach
    // This is needed when the patterns are more complex or we need to evaluate expressions
    if (patterns.length === 0) {
      // Fall back to more thorough extraction
      extractPatternsWithAST(sourceFile, context, parserResult)
    }

    return parserResult
  }
}

/**
 * Extract patterns using the AST-based approach (more thorough)
 */
function extractPatternsWithAST(
  sourceFile: SourceFile,
  context: ParserOptions,
  parserResult: ParserResult
) {
  const importDeclarations = getImportDeclarations(context, sourceFile)
  const file = context.imports.file(importDeclarations)
  const filePath = sourceFile.getFilePath()

  logger.debug(
    'ast:import',
    !file.isEmpty() ? `Found import { ${file.toString()} } in ${filePath}` : `No import found in ${filePath}`,
  )

  if (file.isEmpty()) {
    return
  }

  // Extract all function calls from the source file
  const extractResultByName = extract({
    ast: sourceFile as any, // Type casting to avoid compatibility issues
    functions: {
      matchFn: (prop) => {
        // Match defineRecipe and defineSlotRecipe function calls
        const fnName = prop.fnName
        return fnName === 'defineRecipe' || fnName === 'defineSlotRecipe'
      },
      matchProp: () => true,
      matchArg: () => true,
    },
    flags: { skipTraverseFiles: true },
    getEvaluateOptions: () => evaluateOptions,
  })

  extractResultByName.forEach((result, alias) => {
    const name = file.getName(file.normalizeFnName(alias))
    
    logger.debug(`ast:${name}`, name !== alias ? { kind: result.kind, alias } : { kind: result.kind })

    if (result.kind === 'function') {
      match(name)
        .when(
          (n) => n === 'defineRecipe' || n === 'defineSlotRecipe', 
          (defineName) => {
            // Process defineRecipe and defineSlotRecipe
            result.queryList.forEach((query) => {
              if (query.kind === 'call-expression') {
                // Handle both defineRecipe({ ... }) and defineSlotRecipe({ ... })
                if (query.box.value.length > 0) {
                  const isSlotRecipe = defineName === 'defineSlotRecipe'
                  
                  const map = query.box.value[0]
                  const boxNode = box.isMap(map) ? map : box.fallback(query.box)
                  const combined = combineResult(unbox(boxNode))
                  
                  // Set as recipe or slot recipe based on function name
                  if (isSlotRecipe) {
                    parserResult.setSva({
                      name: defineName,
                      box: boxNode as any, // Type cast to bypass incompatibility
                      data: combined,
                    })
                  } else {
                    parserResult.setCva({
                      name: defineName,
                      box: boxNode as any, // Type cast to bypass incompatibility
                      data: combined,
                    })
                  }
                }
              }
            })
          }
        )
        .otherwise(() => {
          // Other function calls not relevant to our parser
        })
    }
  })
}

/**
 * Combines the standard Panda parser with our defineRecipe parser
 */
export function createExtendedParser(
  context: ParserOptions,
  standardParser: (sourceFile: SourceFile, encoder?: any, options?: any) => ParserResult | undefined
) {
  // Create our define parser
  const defineParser = createDefineParser(context)
  
  return function parse(
    sourceFile: SourceFile | undefined,
    encoder?: any,
    options?: any,
  ) {
    if (!sourceFile) return
    
    // First check if the file has potential defineRecipe patterns
    const hasDefinePatterns = hasDefineRecipePatterns(sourceFile)
    
    // Run the standard parser first - this handles css, cva, sva, etc.
    const result = standardParser(sourceFile, encoder, options)
    
    // If no result from standard parser and no define patterns, we're done
    if (!result && !hasDefinePatterns) return null
    
    // If no result from standard parser but we have define patterns, create new result
    if (!result && hasDefinePatterns) return defineParser(sourceFile, encoder, options)
    
    // If we have a result but no define patterns, return standard result
    if (result && !hasDefinePatterns) return result
    
    // If we have both, run our define parser and merge results
    const defineResult = defineParser(sourceFile, encoder, options)
    
    if (defineResult && result) {
      return result.merge(defineResult)
    }
    
    return result
  }
}

/**
 * Simplified version of Panda's getImportDeclarations function
 * Based on @pandacss/parser/src/get-import-declarations.ts
 */
function getImportDeclarations(context: ParserOptions, sourceFile: SourceFile): ImportResult[] {
  const importDeclarations: ImportResult[] = []

  sourceFile.getImportDeclarations().forEach((node) => {
    // Get the module specifier (import path)
    const mod = node.getModuleSpecifierValue()
    if (!mod) return

    // Process named imports: import { defineRecipe, defineSlotRecipe } from "xxx"
    node.getNamedImports().forEach((specifier) => {
      const name = specifier.getName()
      const alias = specifier.getAliasNode()?.getText() || name

      // Skip imports that aren't relevant
      if (name !== 'defineRecipe' && name !== 'defineSlotRecipe') return

      const result: ImportResult = { name, alias, mod, kind: 'named' }
      importDeclarations.push(result)
    })

    // Process namespace imports: import * as p from "xxx"
    const namespace = node.getNamespaceImport()
    if (namespace) {
      const name = namespace.getText()
      const result: ImportResult = { name, alias: name, mod, kind: 'namespace' }
      
      // Only add if the import is from a package that might contain defineRecipe
      if (
        mod.includes('@pandacss/recipes') ||
        mod.includes('@pandacss') ||
        mod.includes('panda')
      ) {
        importDeclarations.push(result)
      }
    }
  })

  return importDeclarations
}
