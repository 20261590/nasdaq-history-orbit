import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = resolve('src')
const sourceExtensions = new Set(['.ts', '.vue'])
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/gu

async function sourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory)
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry)
    return (await stat(path)).isDirectory() ? sourceFiles(path)
      : sourceExtensions.has(extname(path)) ? [path] : []
  }))
  return nested.flat()
}

function featureName(path: string): string | undefined {
  const parts = relative(sourceRoot, path).split(sep)
  return parts[0] === 'features' ? parts[1] : undefined
}

function layerName(path: string): string {
  const parts = relative(sourceRoot, path).split(sep)
  return parts[0] === 'features' ? `feature:${parts[1]}` : parts[0] ?? 'root'
}

function resolveImport(source: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined
  const target = normalize(resolve(dirname(source), specifier))
  if (!target.startsWith(`${sourceRoot}${sep}`)) return undefined
  return target
}

function isPublicFeatureEntry(target: string, targetFeature: string): boolean {
  return normalize(target) === normalize(join(sourceRoot, 'features', targetFeature))
    || normalize(target) === normalize(join(sourceRoot, 'features', targetFeature, 'index'))
    || normalize(target) === normalize(join(sourceRoot, 'features', targetFeature, 'index.ts'))
}

describe('feature architecture boundaries', () => {
  it('uses feature public entries across feature and app boundaries', async () => {
    const violations: string[] = []
    for (const file of await sourceFiles(sourceRoot)) {
      const text = await readFile(file, 'utf8')
      const sourceFeature = featureName(file)
      for (const match of text.matchAll(importPattern)) {
        const target = resolveImport(file, match[1] ?? '')
        if (!target) continue
        const targetFeature = featureName(target)
        if (!targetFeature) continue
        const crossesFeature = sourceFeature !== targetFeature
        const fromApp = sourceFeature === undefined && layerName(file) === 'app'
        const fromRoot = sourceFeature === undefined && layerName(file) !== 'shared'
        if ((crossesFeature || fromApp || fromRoot) && !isPublicFeatureEntry(target, targetFeature)) {
          violations.push(`${relative(sourceRoot, file)} -> ${match[1]}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('keeps shared independent and has no layer cycles', async () => {
    const edges = new Map<string, Set<string>>()
    const sharedViolations: string[] = []
    for (const file of await sourceFiles(sourceRoot)) {
      const sourceLayer = layerName(file)
      for (const match of (await readFile(file, 'utf8')).matchAll(importPattern)) {
        const target = resolveImport(file, match[1] ?? '')
        if (!target) continue
        const targetLayer = layerName(target)
        if (sourceLayer === 'shared' && (targetLayer === 'app' || targetLayer.startsWith('feature:'))) {
          sharedViolations.push(`${relative(sourceRoot, file)} -> ${match[1]}`)
        }
        if (sourceLayer !== targetLayer) {
          const targets = edges.get(sourceLayer) ?? new Set<string>()
          targets.add(targetLayer)
          edges.set(sourceLayer, targets)
        }
      }
    }
    expect(sharedViolations).toEqual([])

    const visiting = new Set<string>()
    const visited = new Set<string>()
    function visit(node: string): boolean {
      if (visiting.has(node)) return true
      if (visited.has(node)) return false
      visiting.add(node)
      for (const target of edges.get(node) ?? []) if (visit(target)) return true
      visiting.delete(node)
      visited.add(node)
      return false
    }
    expect([...edges.keys()].some(visit)).toBe(false)
  })
})
