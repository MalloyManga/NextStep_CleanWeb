export function formatCssForPreview(css: string): string {
  const source = css.trim()

  if (!source) {
    return ''
  }

  let result = ''
  let depth = 0
  let parenDepth = 0
  let quote: '"' | "'" | null = null
  let escaped = false

  for (const char of source) {
    if (quote) {
      result += char

      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }

      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      result += char
      continue
    }

    if (char === '(') {
      parenDepth += 1
      result += char
      continue
    }

    if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1)
      result += char
      continue
    }

    if (/\s/.test(char)) {
      if (!result.endsWith(' ') && !result.endsWith('\n')) {
        result += ' '
      }
      continue
    }

    if (char === '{') {
      result = `${result.trimEnd()} {\n${indent(depth + 1)}`
      depth += 1
      continue
    }

    if (char === '}') {
      depth = Math.max(0, depth - 1)
      result = `${result.trimEnd()}\n${indent(depth)}}\n${indent(depth)}`
      continue
    }

    if (char === ';' && parenDepth === 0) {
      result = `${result.trimEnd()};\n${indent(depth)}`
      continue
    }

    if (char === ',' && depth === 0 && parenDepth === 0) {
      result = `${result.trimEnd()},\n${indent(depth)}`
      continue
    }

    result += char
  }

  return result.replace(/\n{3,}/g, '\n\n').trim()
}

function indent(depth: number): string {
  return '  '.repeat(depth)
}
