import type { ParserOptions } from '@pandacss/core'
import { getOrCreateSet } from '@pandacss/shared'
import type { ParserResultInterface, ResultItem } from '@pandacss/types'

/**
 * Implementation of ParserResult for the defineRecipe extension
 * Based on @pandacss/parser/src/parser-result.ts
 */
export class ParserResult implements ParserResultInterface {
  /** Ordered list of all ResultItem */
  all: ResultItem[] = []
  jsx = new Set<ResultItem>()
  css = new Set<ResultItem>()
  cva = new Set<ResultItem>()
  sva = new Set<ResultItem>()
  recipe = new Map<string, Set<ResultItem>>()
  pattern = new Map<string, Set<ResultItem>>()
  filePath: string | undefined
  encoder: any

  constructor(
    private context: ParserOptions,
    encoder?: any,
  ) {
    this.encoder = encoder ?? context.encoder
  }

  append(result: ResultItem) {
    this.all.push(result)
    return result
  }

  set(name: 'cva' | 'css' | 'sva', result: ResultItem) {
    switch (name) {
      case 'css':
        this.setCss(result)
        break
      case 'cva':
        this.setCva(result)
        break
      case 'sva':
        this.setSva(result)
        break
      default:
        throw new Error(`Unknown result type ${name}`)
    }
  }

  setCss(result: ResultItem) {
    this.css.add(this.append(Object.assign({ type: 'css' }, result)))
    const encoder = this.encoder
    if (encoder && encoder.processAtomic) {
      result.data.forEach((obj) => encoder.processAtomic(obj))
    }
  }

  setCva(result: ResultItem) {
    this.cva.add(this.append(Object.assign({ type: 'cva' }, result)))
    const encoder = this.encoder
    if (encoder && encoder.processAtomicRecipe) {
      result.data.forEach((data) => encoder.processAtomicRecipe(data))
    }
  }

  setSva(result: ResultItem) {
    this.sva.add(this.append(Object.assign({ type: 'sva' }, result)))
    const encoder = this.encoder
    if (encoder && encoder.processAtomicSlotRecipe) {
      result.data.forEach((data) => encoder.processAtomicSlotRecipe(data))
    }
  }

  setJsx(result: ResultItem) {
    this.jsx.add(this.append(Object.assign({ type: 'jsx' }, result)))
    const encoder = this.encoder
    if (encoder && encoder.processStyleProps) {
      result.data.forEach((obj) => encoder.processStyleProps(obj))
    }
  }

  setPattern(name: string, result: ResultItem) {
    const set = getOrCreateSet(this.pattern, name)
    set.add(this.append(Object.assign({ type: 'pattern', name }, result)))
    const encoder = this.encoder
    if (encoder && encoder.processPattern) {
      result.data.forEach((obj) =>
        encoder.processPattern(name, obj, (result.type as 'pattern' | undefined) ?? 'pattern', result.name),
      )
    }
  }

  setRecipe(recipeName: string, result: ResultItem) {
    const set = getOrCreateSet(this.recipe, recipeName)
    set.add(this.append(Object.assign({ type: 'recipe' }, result)))
    const encoder = this.encoder
    const recipes = this.context.recipes
    if (!encoder || !recipes) return

    const recipeConfig = recipes.getConfig?.(recipeName)
    if (!recipeConfig) return

    // treat recipe jsx like regular recipe + atomic
    if (result.type) {
      result.data.forEach((data) => {
        if (recipes.splitProps) {
          const [recipeProps, styleProps] = recipes.splitProps(recipeName, data)
          encoder.processStyleProps?.(styleProps)
          encoder.processRecipe?.(recipeName, recipeProps)
        }
      })
    } else {
      result.data.forEach((data) => {
        encoder.processRecipe?.(recipeName, data)
      })
    }
  }

  isEmpty() {
    return this.all.length === 0
  }

  setFilePath(filePath: string) {
    this.filePath = filePath
    return this
  }

  merge(result: ParserResult) {
    result.css.forEach((item) => this.css.add(this.append(item)))
    result.cva.forEach((item) => this.cva.add(this.append(item)))
    result.sva.forEach((item) => this.sva.add(this.append(item)))
    result.jsx.forEach((item) => this.jsx.add(this.append(item)))
    result.recipe.forEach((items, name) => {
      const set = getOrCreateSet(this.recipe, name)
      items.forEach((item) => set.add(this.append(item)))
    })
    result.pattern.forEach((items, name) => {
      const set = getOrCreateSet(this.pattern, name)
      items.forEach((item) => set.add(this.append(item)))
    })
    return this
  }

  toArray() {
    return this.all
  }

  toJSON() {
    return {
      css: Array.from(this.css),
      cva: Array.from(this.cva),
      sva: Array.from(this.sva),
      jsx: Array.from(this.jsx),
      recipe: Object.fromEntries(Array.from(this.recipe.entries()).map(([key, value]) => [key, Array.from(value)])),
      pattern: Object.fromEntries(Array.from(this.pattern.entries()).map(([key, value]) => [key, Array.from(value)])),
    }
  }
} 