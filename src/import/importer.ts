/**
 * Ontology Importer module
 * Coordinates the import workflow for ontology templates
 */

import { parseEdn, validateEdnTemplate } from '../parser/edn-parser'
import { logger } from '../utils/logger'
import { LogseqOntologyAPI, OntologyAPIError } from '../api/ontology-api'
import type {
  PropertyDefinition as APIPropertyDefinition,
  ClassDefinition as APIClassDefinition,
} from '../api/types'
import { diffTemplate, createEmptyOntology } from './diff'
import type {
  ImportOptions,
  ImportProgress,
  ImportResult,
  ImportPreview,
  ImportError,
  ParsedTemplate,
  ExistingOntology,
  ClassDefinition,
  PropertyDefinition,
} from './types'

/**
 * Default import options
 */
const defaultOptions: Required<ImportOptions> = {
  dryRun: false,
  onProgress: () => {},
  conflictStrategy: 'ask',
  validate: true,
}

/**
 * Valid property types for Logseq
 */
const VALID_PROPERTY_TYPES = [
  'default',
  'number',
  'date',
  'datetime',
  'checkbox',
  'url',
  'page',
  'node',
]

/**
 * Convert a string to camelCase (for property titles)
 * e.g., "reservation status" -> "reservationStatus"
 *       "Reservation-Status" -> "reservationStatus"
 */
function toCamelCase(str: string): string {
  if (!str) return str
  return str
    .replace(/[-_\s]+(.)?/g, (_: string, char: string | undefined) =>
      char ? char.toUpperCase() : ''
    )
    .replace(/^[A-Z]/, (char: string) => char.toLowerCase())
}

/**
 * Convert a string to PascalCase (for class/tag titles)
 * e.g., "reservation status" -> "ReservationStatus"
 *       "reservation-status" -> "ReservationStatus"
 */
function toPascalCase(str: string): string {
  if (!str) return str
  const camel = toCamelCase(str)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

/**
 * Validation result for import templates
 */
interface ImportValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate an import template structure
 * Provides detailed validation of property types, cardinality, and class structure
 */
function validateImportTemplate(template: ParsedTemplate): ImportValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate properties
  for (const prop of template.properties) {
    if (!prop.name || prop.name.trim() === '') {
      errors.push('Property is missing a name')
      continue
    }

    if (!prop.type) {
      warnings.push(`Property "${prop.name}" is missing type, defaulting to "default"`)
    } else if (!VALID_PROPERTY_TYPES.includes(prop.type)) {
      errors.push(
        `Property "${prop.name}" has invalid type "${prop.type}". ` +
          `Valid types: ${VALID_PROPERTY_TYPES.join(', ')}`
      )
    }

    if (prop.cardinality && !['one', 'many'].includes(prop.cardinality)) {
      errors.push(
        `Property "${prop.name}" has invalid cardinality "${prop.cardinality}". ` +
          `Valid values: one, many`
      )
    }
  }

  // Validate classes
  for (const cls of template.classes) {
    if (!cls.name || cls.name.trim() === '') {
      errors.push('Class is missing a name')
      continue
    }

    // Check for self-referential parent
    if (cls.parent && cls.parent === cls.name) {
      errors.push(`Class "${cls.name}" cannot be its own parent`)
    }
  }

  // Check for duplicate names
  const propNames = new Set<string>()
  for (const prop of template.properties) {
    if (prop.name && propNames.has(prop.name)) {
      warnings.push(`Duplicate property name: "${prop.name}"`)
    }
    if (prop.name) propNames.add(prop.name)
  }

  const classNames = new Set<string>()
  for (const cls of template.classes) {
    if (cls.name && classNames.has(cls.name)) {
      warnings.push(`Duplicate class name: "${cls.name}"`)
    }
    if (cls.name) classNames.add(cls.name)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Valid property types for type coercion
 */
const VALID_TYPES = ['default', 'number', 'date', 'datetime', 'checkbox', 'url', 'page', 'node']

/**
 * Represents the tagged structure from EDN namespace reader macros
 * e.g., #:user.property{...} becomes { tag: ':user.property', val: {...} }
 */
interface TaggedValue {
  tag: string
  val: Record<string, unknown>
}

/**
 * Check if a value is a tagged EDN structure (from namespace reader macros)
 */
function isTaggedValue(value: unknown): value is TaggedValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tag' in value &&
    'val' in value &&
    typeof (value as TaggedValue).tag === 'string' &&
    typeof (value as TaggedValue).val === 'object'
  )
}

/**
 * Get a value from an EDN object, checking both with and without colon prefix
 * The edn-data library may or may not strip the colon depending on configuration
 */
function getEdnValue(obj: Record<string, unknown>, key: string): unknown {
  return obj[key] ?? obj[`:${key}`]
}

/**
 * Check if the EDN data is in Logseq's native database export format
 * Native format has properties/classes as tagged objects, not arrays
 */
function isNativeLogseqFormat(data: Record<string, unknown>): boolean {
  // Check for properties/classes in both key formats
  const props = data['properties'] ?? data[':properties']
  const classes = data['classes'] ?? data[':classes']

  // Native format has tagged objects with user.property/user.class namespaces
  const hasNativeProperties = isTaggedValue(props) && props.tag.includes('user.property')
  const hasNativeClasses = isTaggedValue(classes) && classes.tag.includes('user.class')

  return hasNativeProperties || hasNativeClasses
}

/**
 * Extract the display name from a Logseq identifier
 * e.g., 'user.class/Person-abc123' -> 'Person'
 * e.g., 'Person-abc123' -> 'Person'
 */
function extractDisplayName(identifier: string): string {
  // Remove namespace prefix if present (e.g., 'user.class/')
  const parts = identifier.split('/')
  const withoutNamespace = parts[parts.length - 1] ?? identifier

  // Remove the unique ID suffix (e.g., '-abc123')
  // The pattern is: Name-uniqueId where uniqueId is alphanumeric
  const match = withoutNamespace.match(/^(.+?)-[A-Za-z0-9_-]+$/)
  return match?.[1] ?? withoutNamespace
}

/**
 * Parse a Logseq icon object into the format needed for setBlockIcon
 * Icons can be:
 * - A string (simple case - emoji character or tabler icon name)
 * - An object with :type and :id (Logseq native format from exports)
 *
 * Returns { iconType, iconId } where iconType is 'emoji' | 'tabler-icon'
 *
 * Per Logseq's setBlockIcon API:
 * - iconType: 'emoji' or 'tabler-icon'
 * - iconName: For 'emoji' type, use the NATIVE emoji character (e.g., "📗")
 *             For 'tabler-icon' type, use the tabler icon name (e.g., "home")
 *
 * Note: Logseq does NOT accept emoji-mart IDs (like "green_book") - it needs
 * the actual emoji character. The native emoji is found in :skins[0]:native
 * in the Logseq export format.
 *
 * See: https://logseq.github.io/plugins/interfaces/IEditorProxy.html
 */
function parseIconObject(
  iconData: unknown
): { iconType: 'emoji' | 'tabler-icon'; iconId: string } | undefined {
  if (!iconData) return undefined

  // Simple string case
  if (typeof iconData === 'string') {
    // Detect if it's an emoji character or icon name
    const isNativeEmoji = /^[\p{Emoji}\u200d]+$/u.test(iconData) || iconData.length <= 2
    if (isNativeEmoji) {
      logger.debug('Received native emoji string', { emoji: iconData })
      return { iconType: 'emoji', iconId: iconData }
    }
    // Looks like a tabler icon name
    return { iconType: 'tabler-icon', iconId: iconData }
  }

  // Object case - Logseq native format
  // Example: {:type :emoji, :id "green_book", :skins [{:native "📗"}]}
  if (typeof iconData === 'object' && iconData !== null) {
    const obj = iconData as Record<string, unknown>

    // Get the type - could be :type, type, or inferred from :skins presence
    const typeRaw = obj['type'] || obj[':type']
    const skins = obj['skins'] || obj[':skins']
    const hasSkinsArray = Array.isArray(skins)

    // Determine icon type
    const isEmojiType = typeRaw === ':emoji' || typeRaw === 'emoji' || hasSkinsArray
    const isTablerType = typeRaw === ':tabler-icon' || typeRaw === 'tabler-icon'

    if (isEmojiType) {
      // Get the emoji-mart ID if available
      const emojiMartId = obj['id'] || obj[':id']

      // Logseq's setBlockIcon with 'emoji' type expects colon-wrapped shortcodes
      // like ":clipboard:" not the emoji-mart ID "clipboard" or native "📋"
      if (typeof emojiMartId === 'string' && emojiMartId.length > 0) {
        // Wrap in colons if not already wrapped
        const wrappedId = emojiMartId.startsWith(':') ? emojiMartId : `:${emojiMartId}:`
        logger.debug('Parsed emoji icon with colon-wrapped shortcode', {
          emojiMartId,
          wrappedId,
          hasSkins: hasSkinsArray,
        })
        return { iconType: 'emoji', iconId: wrappedId }
      }

      // Fallback: if no ID but we have native emoji in skins, try that
      if (hasSkinsArray) {
        const skinsArray = skins as Array<Record<string, unknown>>
        if (skinsArray.length > 0) {
          const firstSkin = skinsArray[0]
          const native = firstSkin?.['native'] || firstSkin?.[':native']
          if (typeof native === 'string' && native.length > 0) {
            logger.debug('Parsed emoji icon from native character (fallback)', {
              nativeEmoji: native,
            })
            return { iconType: 'emoji', iconId: native }
          }
        }
      }
    } else if (isTablerType) {
      // For tabler-icon type, use the :id directly
      const iconId = obj['id'] || obj[':id']
      if (typeof iconId === 'string') {
        logger.debug('Parsed tabler icon', { iconId })
        return { iconType: 'tabler-icon', iconId }
      }
    } else {
      // Unknown type - try to use ID as tabler icon if present
      const iconId = obj['id'] || obj[':id']
      if (typeof iconId === 'string') {
        logger.debug('Parsed unknown icon type as tabler', { iconId, originalType: typeRaw })
        return { iconType: 'tabler-icon', iconId }
      }
    }
  }

  return undefined
}

/**
 * Extract additional metadata from build/properties structure
 */
function extractBuildProperties(buildProps: unknown): {
  description?: string
  title?: string
  icon?: string
  iconType?: 'emoji' | 'tabler-icon'
  hide?: boolean
} {
  if (!buildProps || typeof buildProps !== 'object') return {}

  // Handle tagged value structure (e.g., #:logseq.property{...})
  const props = isTaggedValue(buildProps) ? buildProps.val : (buildProps as Record<string, unknown>)

  const result: {
    description?: string
    title?: string
    icon?: string
    iconType?: 'emoji' | 'tabler-icon'
    hide?: boolean
  } = {}

  // Look for fields in various formats
  const desc =
    props['logseq.property/description'] ||
    props['description'] ||
    props[':logseq.property/description']
  if (typeof desc === 'string') result.description = desc

  const title = props['logseq.property/title'] || props['title'] || props[':logseq.property/title']
  if (typeof title === 'string') result.title = title

  // Parse icon - can be string or complex object
  const iconRaw =
    props['logseq.property/icon'] ||
    props['icon'] ||
    props[':icon'] ||
    props[':logseq.property/icon']
  const parsedIcon = parseIconObject(iconRaw)
  if (parsedIcon) {
    result.icon = parsedIcon.iconId
    result.iconType = parsedIcon.iconType
  }

  const hide = props['logseq.property/hide?'] || props['hide?'] || props[':logseq.property/hide?']
  if (typeof hide === 'boolean') result.hide = hide

  return result
}

/**
 * Parse Logseq's native database export format for properties
 */
function parseNativeProperties(propsData: TaggedValue): PropertyDefinition[] {
  const properties: PropertyDefinition[] = []

  for (const [_key, value] of Object.entries(propsData.val)) {
    if (typeof value !== 'object' || value === null) continue

    const prop = value as Record<string, unknown>

    // Get property name from block/title (check both with and without colon prefix)
    const name = getEdnValue(prop, 'block/title')
    if (typeof name !== 'string' || !name) continue

    // Get cardinality - format is 'db.cardinality/one' or 'db.cardinality/many'
    const cardinalityRaw = getEdnValue(prop, 'db/cardinality')
    const cardinality =
      typeof cardinalityRaw === 'string' && cardinalityRaw.includes('many') ? 'many' : 'one'

    // Get type - format is 'default', 'number', etc.
    const typeRaw = getEdnValue(prop, 'logseq.property/type')
    const typeStr = typeof typeRaw === 'string' ? typeRaw : 'default'
    const type = VALID_TYPES.includes(typeStr)
      ? (typeStr as import('../types').PropertySchemaType)
      : 'default'

    // Get additional metadata from nested build/properties (check both key variants)
    const buildProps = getEdnValue(prop, 'build/properties')
    const metadata = extractBuildProperties(buildProps)

    // Get hide property directly if not in build/properties
    let hide = metadata.hide
    const hideRaw =
      getEdnValue(prop, 'logseq.property/hide?') ?? getEdnValue(prop, 'property/hide?')
    if (typeof hideRaw === 'boolean') hide = hideRaw

    // Get closed values if present
    let closed: boolean | undefined
    let closedValues: import('../types').ClosedValue[] | undefined
    const closedRaw =
      getEdnValue(prop, 'logseq.property/closed-values') ??
      getEdnValue(prop, 'build/closed-values') ??
      getEdnValue(prop, 'property/closed-values')
    if (Array.isArray(closedRaw) && closedRaw.length > 0) {
      closed = true
      closedValues = closedRaw.map((cv: unknown) => {
        if (typeof cv === 'string') return { value: cv }
        if (typeof cv === 'object' && cv !== null) {
          const cvObj = cv as Record<string, unknown>
          return {
            value: String(cvObj['value'] || cvObj['block/title'] || ''),
            icon: typeof cvObj['icon'] === 'string' ? cvObj['icon'] : undefined,
            description:
              typeof cvObj['description'] === 'string' ? cvObj['description'] : undefined,
          }
        }
        return { value: String(cv) }
      })
    }

    // Get icon directly from property if not in build/properties
    let icon = metadata.icon
    let iconType = metadata.iconType
    const propIconRaw = getEdnValue(prop, 'icon') ?? getEdnValue(prop, 'logseq.property/icon')
    if (propIconRaw) {
      const parsedPropIcon = parseIconObject(propIconRaw)
      if (parsedPropIcon) {
        icon = parsedPropIcon.iconId
        iconType = parsedPropIcon.iconType
      }
    }

    properties.push({
      name,
      type,
      cardinality,
      description: metadata.description,
      title: metadata.title,
      hide,
      icon,
      iconType,
      closed,
      closedValues,
    })
  }

  return properties
}

/**
 * Parse Logseq's native database export format for classes
 */
function parseNativeClasses(classesData: TaggedValue): ClassDefinition[] {
  const classes: ClassDefinition[] = []

  for (const [_key, value] of Object.entries(classesData.val)) {
    if (typeof value !== 'object' || value === null) continue

    const cls = value as Record<string, unknown>

    // Get class name from block/title (check both with and without colon prefix)
    const name = getEdnValue(cls, 'block/title')
    if (typeof name !== 'string' || !name) continue

    // Get parent class from build/class-extends
    let parent: string | undefined
    const extendsRaw = getEdnValue(cls, 'build/class-extends')
    if (Array.isArray(extendsRaw) && extendsRaw.length > 0) {
      // Take the first parent (Logseq supports only single inheritance conceptually)
      const parentRef = extendsRaw[0] as unknown
      if (typeof parentRef === 'string') {
        parent = extractDisplayName(parentRef)
      }
    }

    // Get associated properties from build/class-properties
    let classProperties: string[] | undefined
    const propsRaw = getEdnValue(cls, 'build/class-properties')
    if (Array.isArray(propsRaw) && propsRaw.length > 0) {
      classProperties = propsRaw
        .filter((p): p is string => typeof p === 'string')
        .map((p) => extractDisplayName(p))
    }

    // Get additional metadata from nested build/properties
    const buildProps = getEdnValue(cls, 'build/properties')
    const metadata = extractBuildProperties(buildProps)

    // Get icon directly from class if not in build/properties
    let icon = metadata.icon
    let iconType = metadata.iconType
    const iconRaw = getEdnValue(cls, 'icon') ?? getEdnValue(cls, 'logseq.class/icon')
    if (iconRaw) {
      const parsedClassIcon = parseIconObject(iconRaw)
      if (parsedClassIcon) {
        icon = parsedClassIcon.iconId
        iconType = parsedClassIcon.iconType
      }
    }

    // Get title from class
    let title = metadata.title
    const titleRaw = getEdnValue(cls, 'title') ?? getEdnValue(cls, 'logseq.class/title')
    if (typeof titleRaw === 'string') title = titleRaw

    classes.push({
      name,
      parent,
      description: metadata.description,
      title,
      icon,
      iconType,
      properties: classProperties,
    })
  }

  return classes
}

/**
 * Convert Logseq's native database export format to ParsedTemplate
 */
function nativeEdnToParsedTemplate(data: Record<string, unknown>): ParsedTemplate {
  const properties: PropertyDefinition[] = []
  const classes: ClassDefinition[] = []

  // Parse properties if present (check both key formats)
  const propsData = data['properties'] ?? data[':properties']
  if (isTaggedValue(propsData)) {
    logger.debug('Parsing native properties', { valKeys: Object.keys(propsData.val).length })
    properties.push(...parseNativeProperties(propsData))
    logger.debug('Parsed native properties', { count: properties.length })
  } else {
    logger.debug('Properties not found or not tagged', {
      hasProperties: propsData !== undefined,
      isTagged: isTaggedValue(propsData),
    })
  }

  // Parse classes if present (check both key formats)
  const classesData = data['classes'] ?? data[':classes']
  if (isTaggedValue(classesData)) {
    logger.debug('Parsing native classes', { valKeys: Object.keys(classesData.val).length })
    classes.push(...parseNativeClasses(classesData))
    logger.debug('Parsed native classes', { count: classes.length })
  } else {
    logger.debug('Classes not found or not tagged', {
      hasClasses: classesData !== undefined,
      isTagged: isTaggedValue(classesData),
    })
  }

  const result = {
    classes,
    properties,
    metadata: {
      name: data['name'] ? String(data['name']) : 'Logseq Export',
      description: 'Imported from Logseq database export',
    },
  }

  logger.info('Native template parsed', {
    classCount: classes.length,
    propertyCount: properties.length,
  })

  return result
}

/**
 * Convert parsed EDN to ParsedTemplate structure
 * Automatically detects and handles both simplified template format and native Logseq format
 */
function ednToParsedTemplate(data: Record<string, unknown>): ParsedTemplate {
  // Debug: log the structure of the parsed EDN
  const topLevelKeys = Object.keys(data)
  logger.debug('Parsed EDN top-level keys', { keys: topLevelKeys })

  // Check for properties/classes in various key formats
  const propsKey = topLevelKeys.find((k) => k === 'properties' || k === ':properties')
  const classesKey = topLevelKeys.find((k) => k === 'classes' || k === ':classes')
  logger.debug('Found keys', { propsKey, classesKey })

  if (propsKey) {
    const propsVal = data[propsKey]
    logger.debug('Properties value type', {
      type: typeof propsVal,
      isArray: Array.isArray(propsVal),
      isTagged: isTaggedValue(propsVal),
      sample: propsVal ? JSON.stringify(propsVal).slice(0, 200) : 'null',
    })
  }

  // Check if this is native Logseq format and use appropriate parser
  if (isNativeLogseqFormat(data)) {
    logger.debug('Detected native Logseq format')
    return nativeEdnToParsedTemplate(data)
  }

  logger.debug('Using simplified template format parser')

  // Original simplified template format
  const classes: ClassDefinition[] = []
  const properties: PropertyDefinition[] = []

  // Find the actual key (could be 'classes' or ':classes' depending on EDN parser config)
  const classesData = data['classes'] ?? data[':classes']
  const propertiesData = data['properties'] ?? data[':properties']

  logger.debug('Extracting from keys', {
    hasClasses: classesData !== undefined,
    isClassesArray: Array.isArray(classesData),
    hasProperties: propertiesData !== undefined,
    isPropertiesArray: Array.isArray(propertiesData),
  })

  // Extract classes
  if (Array.isArray(classesData)) {
    for (const cls of classesData) {
      if (typeof cls === 'object' && cls !== null) {
        const c = cls as Record<string, unknown>
        const name = getEdnValue(c, 'name')
        const namespace = getEdnValue(c, 'namespace')
        const parent = getEdnValue(c, 'parent')
        const description = getEdnValue(c, 'description')
        const clsProperties = getEdnValue(c, 'properties')
        const title = getEdnValue(c, 'title')
        const icon = getEdnValue(c, 'icon')

        classes.push({
          name: String(name || ''),
          namespace: namespace ? String(namespace) : undefined,
          parent: parent ? String(parent) : undefined,
          description: description ? String(description) : undefined,
          title: title ? String(title) : undefined,
          icon: icon ? String(icon) : undefined,
          properties: Array.isArray(clsProperties) ? clsProperties.map(String) : undefined,
        })
      }
    }
  }

  // Extract properties
  if (Array.isArray(propertiesData)) {
    for (const prop of propertiesData) {
      if (typeof prop === 'object' && prop !== null) {
        const p = prop as Record<string, unknown>
        const name = getEdnValue(p, 'name')
        const namespace = getEdnValue(p, 'namespace')
        const propType = getEdnValue(p, 'type')
        const description = getEdnValue(p, 'description')
        const cardinality = getEdnValue(p, 'cardinality')
        const required = getEdnValue(p, 'required')
        const title = getEdnValue(p, 'title')
        const hide = getEdnValue(p, 'hide')
        const icon = getEdnValue(p, 'icon')
        const closed = getEdnValue(p, 'closed')
        const closedValuesRaw = getEdnValue(p, 'closed-values') || getEdnValue(p, 'closedValues')
        const choicesRaw = getEdnValue(p, 'choices')
        const defaultValue = getEdnValue(p, 'default') || getEdnValue(p, 'defaultValue')

        const typeStr = String(propType || 'default')
        // Validate and coerce type to PropertySchemaType
        const validTypes = [
          'default',
          'number',
          'date',
          'datetime',
          'checkbox',
          'url',
          'page',
          'node',
        ]
        const type = validTypes.includes(typeStr)
          ? (typeStr as import('../types').PropertySchemaType)
          : 'default'

        // Parse closed values if present
        let closedValues: import('../types').ClosedValue[] | undefined
        if (Array.isArray(closedValuesRaw) && closedValuesRaw.length > 0) {
          closedValues = closedValuesRaw.map((cv: unknown) => {
            if (typeof cv === 'string') return { value: cv }
            if (typeof cv === 'object' && cv !== null) {
              const cvObj = cv as Record<string, unknown>
              return {
                value: String(getEdnValue(cvObj, 'value') || ''),
                icon: getEdnValue(cvObj, 'icon') ? String(getEdnValue(cvObj, 'icon')) : undefined,
                description: getEdnValue(cvObj, 'description')
                  ? String(getEdnValue(cvObj, 'description'))
                  : undefined,
              }
            }
            return { value: String(cv) }
          })
        }

        // Parse simple choices if present (alternative to closedValues)
        let choices: string[] | undefined
        if (Array.isArray(choicesRaw) && choicesRaw.length > 0) {
          choices = choicesRaw.map((c: unknown) => String(c))
        }

        properties.push({
          name: String(name || ''),
          namespace: namespace ? String(namespace) : undefined,
          type,
          description: description ? String(description) : undefined,
          title: title ? String(title) : undefined,
          cardinality: cardinality === 'many' ? 'many' : 'one',
          required: Boolean(required),
          hide: typeof hide === 'boolean' ? hide : undefined,
          icon: icon ? String(icon) : undefined,
          closed: typeof closed === 'boolean' ? closed : closedValues ? true : undefined,
          closedValues,
          choices,
          defaultValue,
        })
      }
    }
  }

  const result = {
    classes,
    properties,
    metadata: {
      name: data['name'] ? String(data['name']) : undefined,
      version: data['version'] ? String(data['version']) : undefined,
      description: data['description'] ? String(data['description']) : undefined,
    },
  }

  logger.info('Parsed template result', {
    classCount: result.classes.length,
    propertyCount: result.properties.length,
    metadata: result.metadata,
  })

  return result
}

/**
 * OntologyImporter class
 * Handles parsing, validation, comparison, and import of ontology templates
 */
export class OntologyImporter {
  private options: Required<ImportOptions>
  private api: LogseqOntologyAPI

  constructor(options?: ImportOptions) {
    this.options = { ...defaultOptions, ...options }
    this.api = new LogseqOntologyAPI()
  }

  /**
   * Report progress to callback
   */
  private reportProgress(progress: ImportProgress): void {
    this.options.onProgress(progress)
  }

  /**
   * Parse EDN content into a template structure
   */
  private parseContent(content: string, validate: boolean = false): ParsedTemplate {
    const data = parseEdn(content)

    // Basic EDN structure validation
    const isValidEdn = validateEdnTemplate(data)
    if (!isValidEdn) {
      throw new Error('Template validation failed: invalid EDN structure')
    }

    const template = ednToParsedTemplate(data as unknown as Record<string, unknown>)

    // Full template validation if requested
    if (validate) {
      const validation = validateImportTemplate(template)

      // Log warnings but don't fail
      if (validation.warnings.length > 0) {
        logger.warn('Template validation warnings', { warnings: validation.warnings })
      }

      // Fail on errors
      if (!validation.valid) {
        throw new Error(
          `Template validation failed:\n${validation.errors.map((e) => `  - ${e}`).join('\n')}`
        )
      }
    }

    return template
  }

  /**
   * Get existing ontology from Logseq graph
   * Uses the Logseq API to query existing properties and classes
   *
   * @throws Error if the Logseq API is not available (not in plugin context)
   * @remarks
   * This method will return an empty ontology if fetching fails due to
   * query errors (e.g., empty graph, database issues), but will throw
   * if the Logseq API itself is unavailable.
   */
  private async getExistingOntology(): Promise<ExistingOntology> {
    try {
      const [existingProperties, existingClasses] = await Promise.all([
        this.api.getExistingProperties(),
        this.api.getExistingClasses(),
      ])

      // Convert API types to import types
      const classes = new Map<string, ClassDefinition>()
      const properties = new Map<string, PropertyDefinition>()

      for (const [name, entity] of existingClasses) {
        classes.set(name, {
          name: entity.name,
          parent: entity.parent,
          properties: entity.properties,
        })
      }

      for (const [name, entity] of existingProperties) {
        properties.set(name, {
          name: entity.name,
          type: entity.type,
          cardinality: entity.cardinality,
        })
      }

      return { classes, properties }
    } catch (error) {
      // Check if this is an API availability error - these should propagate
      if (error instanceof Error && error.message.includes('not available')) {
        logger.error('Logseq API not available', error)
        throw error
      }

      // For other errors (query failures, etc.), log and return empty
      // This allows imports to proceed even if the graph is empty or has issues
      logger.warn('Failed to fetch existing ontology, proceeding with empty state', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.name : typeof error,
      })
      return createEmptyOntology()
    }
  }

  /**
   * Small delay helper to avoid overwhelming Logseq's API
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Apply changes to Logseq graph
   * Uses the Logseq API to create/update properties and classes
   */
  private async applyChanges(
    preview: ImportPreview
  ): Promise<{ classes: number; properties: number }> {
    logger.info('Applying changes', {
      newClasses: preview.newClasses.length,
      updatedClasses: preview.updatedClasses.length,
      newProperties: preview.newProperties.length,
      updatedProperties: preview.updatedProperties.length,
    })

    let classesApplied = 0
    let propertiesApplied = 0
    let skipped = 0
    const errors: Array<{ name: string; error: string }> = []

    // Track properties that were successfully created by this plugin
    // Only these can be linked to classes (Logseq ownership restriction)
    const createdProperties = new Set<string>()

    // Helper to normalize property name for comparison
    const normalizePropertyName = (name: string): string => name.toLowerCase().replace(/\s+/g, '-')

    // Helper to check if error is a duplicate or ownership restricted (should be skipped, not treated as error)
    const isDuplicateError = (error: unknown): boolean => {
      if (error instanceof OntologyAPIError) {
        // Use the isDuplicate() method which covers DUPLICATE_*, and PLUGIN_OWNERSHIP_RESTRICTED
        return error.isDuplicate()
      }
      // Also check error message for common patterns
      const message = error instanceof Error ? error.message : String(error)
      return (
        message.includes('already exists') ||
        message.includes('Plugins can only upsert its own properties')
      )
    }

    // Calculate totals for progress tracking
    const totalItems =
      preview.newProperties.length +
      preview.updatedProperties.length +
      preview.newClasses.length +
      preview.updatedClasses.length
    let processedItems = 0

    // Create new properties (with small delay between each to avoid rate limiting)
    for (const prop of preview.newProperties) {
      this.reportProgress({
        phase: 'importing',
        current: processedItems,
        total: totalItems,
        message: `Creating property: ${prop.name}`,
      })
      try {
        // Use explicit title from EDN as-is, or derive from name using camelCase
        const derivedTitle = prop.title ?? toCamelCase(prop.name)
        const apiProp: APIPropertyDefinition = {
          name: prop.name,
          type: (prop.type as APIPropertyDefinition['type']) || 'default',
          cardinality: prop.cardinality || 'one',
          description: prop.description,
          title: derivedTitle,
          hide: prop.hide,
          icon: prop.icon,
          iconType: prop.iconType,
        }
        logger.debug('Creating property:', {
          name: prop.name,
          originalTitle: prop.title,
          derivedTitle,
          type: apiProp.type,
          hide: apiProp.hide,
        })
        await this.api.createProperty(apiProp)
        propertiesApplied++
        // Track this property as successfully created (normalized name)
        createdProperties.add(normalizePropertyName(prop.name))
        // Small delay to allow Logseq to process
        await this.delay(50)
      } catch (error) {
        if (isDuplicateError(error)) {
          // Property exists or is owned by another source - skip it
          const reason =
            error instanceof OntologyAPIError && error.code === 'PLUGIN_OWNERSHIP_RESTRICTED'
              ? 'owned by another source'
              : 'already exists'
          logger.debug(`Property ${reason}, skipping: ${prop.name}`)
          skipped++
        } else {
          const message = error instanceof Error ? error.message : String(error)
          logger.error(`Failed to create property: ${prop.name}`, error)
          errors.push({ name: prop.name, error: message })
        }
      }
      processedItems++
    }

    // Update existing properties
    for (const update of preview.updatedProperties) {
      this.reportProgress({
        phase: 'importing',
        current: processedItems,
        total: totalItems,
        message: `Updating property: ${update.name}`,
      })
      try {
        await this.api.updateProperty(update.name, {
          type: update.after.type as APIPropertyDefinition['type'],
          cardinality: update.after.cardinality,
          description: update.after.description,
          // Use explicit title from EDN as-is, or derive from name using camelCase
          title: update.after.title ?? toCamelCase(update.name),
          hide: update.after.hide,
          icon: update.after.icon,
          iconType: update.after.iconType,
        })
        propertiesApplied++
        await this.delay(50)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`Failed to update property: ${update.name}`, error)
        errors.push({ name: update.name, error: message })
      }
      processedItems++
    }

    // Create new classes
    for (const cls of preview.newClasses) {
      this.reportProgress({
        phase: 'importing',
        current: processedItems,
        total: totalItems,
        message: `Creating class: ${cls.name}`,
      })
      try {
        // Filter properties to only include those created by this plugin
        // Logseq won't allow linking to properties owned by other sources
        let filteredProperties: string[] | undefined = undefined
        if (cls.properties && cls.properties.length > 0) {
          filteredProperties = cls.properties.filter((propName) =>
            createdProperties.has(normalizePropertyName(propName))
          )
          if (filteredProperties.length < cls.properties.length) {
            const skippedProps = cls.properties.length - filteredProperties.length
            logger.debug(
              `Class "${cls.name}": ${skippedProps} property reference(s) skipped (not owned by this plugin)`
            )
          }
          // Don't pass empty array - use undefined instead
          if (filteredProperties.length === 0) {
            filteredProperties = undefined
          }
        }

        const apiClass: APIClassDefinition = {
          name: cls.name,
          parent: cls.parent,
          description: cls.description,
          // Use explicit title from EDN as-is, or derive from name using PascalCase
          title: cls.title ?? toPascalCase(cls.name),
          icon: cls.icon,
          iconType: cls.iconType,
          properties: filteredProperties,
        }
        logger.debug('Creating class:', {
          name: cls.name,
          propertyCount: filteredProperties?.length ?? 0,
        })
        await this.api.createClass(apiClass)
        classesApplied++
        await this.delay(50)
      } catch (error) {
        if (isDuplicateError(error)) {
          logger.debug(`Class already exists, skipping: ${cls.name}`)
          skipped++
        } else {
          const message = error instanceof Error ? error.message : String(error)
          logger.error(`Failed to create class: ${cls.name}`, error)
          errors.push({ name: cls.name, error: message })
        }
      }
      processedItems++
    }

    // Update existing classes
    for (const update of preview.updatedClasses) {
      this.reportProgress({
        phase: 'importing',
        current: processedItems,
        total: totalItems,
        message: `Updating class: ${update.name}`,
      })
      try {
        // Filter properties to only include those created by this plugin
        let filteredProperties: string[] | undefined = undefined
        if (update.after.properties && update.after.properties.length > 0) {
          filteredProperties = update.after.properties.filter((propName) =>
            createdProperties.has(normalizePropertyName(propName))
          )
          if (filteredProperties.length === 0) {
            filteredProperties = undefined
          }
        }

        await this.api.updateClass(update.name, {
          parent: update.after.parent,
          description: update.after.description,
          // Use explicit title from EDN as-is, or derive from name using PascalCase
          title: update.after.title ?? toPascalCase(update.name),
          icon: update.after.icon,
          iconType: update.after.iconType,
          properties: filteredProperties,
        })
        classesApplied++
        await this.delay(50)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`Failed to update class: ${update.name}`, error)
        errors.push({ name: update.name, error: message })
      }
      processedItems++
    }

    // Log any errors that occurred
    if (errors.length > 0) {
      logger.warn('Some operations failed during import', { errors })
    }

    if (skipped > 0) {
      logger.info(`Skipped ${skipped} item(s) that already exist`)
    }

    logger.info('Changes applied', {
      classes: classesApplied,
      properties: propertiesApplied,
      skipped,
      errorCount: errors.length,
    })

    // If all operations failed (excluding skipped items), throw an error
    // But if items were skipped, that's fine - they already exist
    if (propertiesApplied === 0 && classesApplied === 0 && skipped === 0 && errors.length > 0) {
      throw new Error(`All import operations failed: ${errors[0]?.error || 'Unknown error'}`)
    }

    return {
      classes: classesApplied,
      properties: propertiesApplied,
    }
  }

  /**
   * Generate a preview of changes without applying them
   */
  async preview(content: string): Promise<ImportPreview> {
    this.reportProgress({
      phase: 'parsing',
      current: 0,
      total: 3,
      message: 'Parsing template...',
    })

    // Parse and optionally validate in one step
    const template = this.parseContent(content, this.options.validate)

    this.reportProgress({
      phase: 'validating',
      current: 1,
      total: 3,
      message: 'Validation complete',
    })

    this.reportProgress({
      phase: 'comparing',
      current: 2,
      total: 3,
      message: 'Comparing with existing ontology...',
    })

    const existing = await this.getExistingOntology()
    const preview = diffTemplate(template, existing)

    this.reportProgress({
      phase: 'comparing',
      current: 3,
      total: 3,
      message: 'Preview complete',
    })

    return preview
  }

  /**
   * Import a template into Logseq
   *
   * @param content - EDN template content to import
   * @param options - Optional import options
   * @param precomputedPreview - Optional pre-computed preview to avoid duplicate parsing.
   *                             If provided, the content parameter is still required for
   *                             error handling but won't be re-parsed.
   */
  async import(
    content: string,
    options?: ImportOptions,
    precomputedPreview?: ImportPreview
  ): Promise<ImportResult> {
    const startTime = Date.now()
    const opts = { ...this.options, ...options }
    const errors: ImportError[] = []

    // Update instance options so reportProgress uses the passed callback
    const previousOptions = this.options
    this.options = opts

    try {
      // Use precomputed preview if provided, otherwise generate it
      const preview = precomputedPreview ?? (await this.preview(content))

      // Report initial progress with correct totals
      const totalItems =
        preview.newProperties.length +
        preview.updatedProperties.length +
        preview.newClasses.length +
        preview.updatedClasses.length

      this.reportProgress({
        phase: 'importing',
        current: 0,
        total: totalItems,
        message: 'Starting import...',
      })

      // Check for unresolved conflicts
      if (preview.conflicts.length > 0 && opts.conflictStrategy === 'ask') {
        return {
          success: false,
          preview,
          applied: { classes: 0, properties: 0 },
          errors: [
            {
              code: 'UNRESOLVED_CONFLICTS',
              message: `${preview.conflicts.length} conflict(s) require resolution`,
            },
          ],
          duration: Date.now() - startTime,
          dryRun: opts.dryRun,
        }
      }

      // If dry run, don't apply changes
      if (opts.dryRun) {
        return {
          success: true,
          preview,
          applied: { classes: 0, properties: 0 },
          errors: [],
          duration: Date.now() - startTime,
          dryRun: true,
        }
      }

      // Apply changes (applyChanges reports granular progress)
      const applied = await this.applyChanges(preview)

      return {
        success: true,
        preview,
        applied,
        errors,
        duration: Date.now() - startTime,
        dryRun: false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push({
        code: 'IMPORT_FAILED',
        message,
      })

      return {
        success: false,
        preview: {
          newClasses: [],
          updatedClasses: [],
          newProperties: [],
          updatedProperties: [],
          classesToRemove: [],
          propertiesToRemove: [],
          conflicts: [],
          summary: { totalNew: 0, totalUpdated: 0, totalRemoved: 0, totalConflicts: 0 },
        },
        applied: { classes: 0, properties: 0 },
        errors,
        duration: Date.now() - startTime,
        dryRun: opts.dryRun,
      }
    } finally {
      // Restore previous options
      this.options = previousOptions
    }
  }
}
