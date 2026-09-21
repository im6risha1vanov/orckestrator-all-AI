import fs from "node:fs"
import path from "node:path"

import type { FileNode } from "./types"

const SKIP = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  "data",
  ".artel",
  ".turbo",
  "__pycache__",
])

export function assertInside(root: string, target: string) {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(target)
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Путь вне проекта")
  }
  return resolved
}

export function readTree(root: string, maxEntries = 180, maxDepth = 4): FileNode[] {
  const resolved = path.resolve(root)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error("Каталог проекта не найден")
  }

  let count = 0

  function walk(dir: string, depth: number): FileNode[] {
    if (depth > maxDepth || count >= maxEntries) return []
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name, "ru")
    })
    const nodes: FileNode[] = []
    for (const entry of entries) {
      if (count >= maxEntries) break
      if (entry.name.startsWith(".") && entry.name !== ".gitignore") continue
      if (SKIP.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      count += 1
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: full,
          type: "dir",
          children: walk(full, depth + 1),
        })
      } else {
        nodes.push({ name: entry.name, path: full, type: "file" })
      }
    }
    return nodes
  }

  return walk(resolved, 1)
}

export function flattenFiles(nodes: FileNode[], acc: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === "file") acc.push(node.path)
    if (node.children) flattenFiles(node.children, acc)
  }
  return acc
}

export function relativeTo(root: string, filePath: string) {
  return path.relative(root, filePath) || filePath
}
