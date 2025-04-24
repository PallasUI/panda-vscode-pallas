import { TextDocument } from 'vscode-languageserver-textdocument'
import { RecipeParser, type RecipeDefinition } from './recipe-parser'
import type { PandaContext } from '@pandacss/node'

export class RecipeParserCache {
  private cache: Map<string, { 
    version: number, 
    recipes: RecipeDefinition[] 
  }> = new Map()
  
  private parser: RecipeParser
  
  constructor(private getContext: () => PandaContext | undefined) {
    this.parser = new RecipeParser(getContext)
  }
  
  parseDocument(doc: TextDocument): RecipeDefinition[] {
    const cacheKey = doc.uri
    const cachedResult = this.cache.get(cacheKey)
    
    // If we have a cached result for this document and the version matches, return it
    if (cachedResult && cachedResult.version === doc.version) {
      return cachedResult.recipes
    }
    
    // Otherwise parse the document and cache the result
    const recipes = this.parser.parseDocument(doc)
    this.cache.set(cacheKey, {
      version: doc.version,
      recipes
    })
    
    return recipes
  }
  
  invalidateCache(uri: string): void {
    this.cache.delete(uri)
  }
  
  invalidateAllCaches(): void {
    this.cache.clear()
  }
} 