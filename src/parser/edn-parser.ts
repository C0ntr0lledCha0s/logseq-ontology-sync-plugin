/**
 * EDN Parser module
 * Handles parsing of EDN template files
 */

import { parseEDNString, toEDNStringFromSimpleObject, type EDNObjectableVal } from 'edn-data'

export interface EdnData {
  [key: string]: EDNObjectableVal
}

/**
 * Parse EDN string to JavaScript object
 */
export function parseEdn(ednString: string): EdnData {
  try {
    const parsed = parseEDNString(ednString, { mapAs: 'object', keywordAs: 'string' })
    return parsed as EdnData
  } catch (error) {
    throw new Error(`Failed to parse EDN: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Encode JavaScript object to EDN string
 */
export function encodeEdn(data: EdnData): string {
  try {
    return toEDNStringFromSimpleObject(data)
  } catch (error) {
    throw new Error(`Failed to encode EDN: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Validate EDN template structure
 */
export function validateEdnTemplate(data: EdnData): boolean {
  // Basic validation - can be extended
  if (typeof data !== 'object' || data === null) {
    return false
  }
  return true
}
