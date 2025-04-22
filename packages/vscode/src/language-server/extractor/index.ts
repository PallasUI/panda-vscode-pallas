/**
 * Panda CSS VS Code Extension - defineRecipe Parser
 * 
 * This module extends Panda's parser to support scanning for defineRecipe and defineSlotRecipe
 * patterns, which are functionally equivalent to cva and sva patterns.
 */

import { createDefineParser, createExtendedParser } from './parseConfigs'
import { ParserResult } from './parser-result'
import { extractDefinePatterns, hasDefineRecipePatterns } from './definePatternExtractor'

// Export all components
export {
  // Core components
  ParserResult,
  
  // Parser functions
  createDefineParser,
  createExtendedParser,
  
  // Utility functions for direct pattern extraction
  extractDefinePatterns,
  hasDefineRecipePatterns
} 