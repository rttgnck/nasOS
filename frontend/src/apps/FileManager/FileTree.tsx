import { useCallback, useEffect, useState } from 'react'
import { Folder, Home } from 'lucide-react'
import { api } from '../../hooks/useApi'

interface TreeNode {
  name: string
  path: string
  children: TreeNode[]
  has_children: boolean | null
}

interface FileTreeProps {
  currentPath: string
  onNavigate: (path: string) => void
}

export function FileTree({ currentPath, onNavigate }: FileTreeProps) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']))

  const loadTree = useCallback(async (path: string) => {
    try {
      const data = await api<{ children: TreeNode[] }>(
        `/api/files/tree?path=${encodeURIComponent(path)}&depth=1`
      )
      return data.children
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    loadTree('').then(setTree)
  }, [loadTree])

  // Auto-expand tree to match currentPath when navigating in the file viewer
  useEffect(() => {
    if (!currentPath) return
    const segments = currentPath.split('/').filter(Boolean)
    const ancestors: string[] = []
    for (let i = 0; i < segments.length; i++) {
      ancestors.push(segments.slice(0, i + 1).join('/'))
    }

    const expandAncestors = async () => {
      const next = new Set(expanded)
      let currentTree = tree
      for (const ancestor of ancestors) {
        next.add(ancestor)
        // Find node in tree and load children if needed
        const node = findNode(currentTree, ancestor)
        if (node && node.children.length === 0 && node.has_children !== false) {
          const children = await loadTree(node.path)
          updateChildren(tree, node.path, children)
          node.children = children
        }
      }
      setTree([...tree])
      setExpanded(next)
    }
    expandAncestors()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath])

  const toggleExpand = async (node: TreeNode) => {
    const next = new Set(expanded)
    if (next.has(node.path)) {
      next.delete(node.path)
    } else {
      next.add(node.path)
      // Load children if not already loaded
      if (node.children.length === 0 && node.has_children !== false) {
        const children = await loadTree(node.path)
        updateChildren(tree, node.path, children)
        setTree([...tree])
      }
    }
    setExpanded(next)
  }

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expanded.has(node.path)
    const isActive = currentPath === node.path
    const hasKids = node.children.length > 0 || node.has_children

    return (
      <div key={node.path}>
        <div
          className="fm-tree-item"
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          data-active={isActive}
          onClick={() => onNavigate(node.path)}
        >
          <span
            className="fm-tree-toggle"
            onClick={(e) => {
              e.stopPropagation()
              toggleExpand(node)
            }}
          >
            {hasKids ? (isExpanded ? '▾' : '▸') : ' '}
          </span>
          <span className="fm-tree-icon"><Folder size={14} /></span>
          <span className="fm-tree-name">{node.name}</span>
        </div>
        {isExpanded && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="fm-tree">
      <div
        className="fm-tree-item"
        data-active={currentPath === ''}
        onClick={() => onNavigate('')}
      >
        <span className="fm-tree-toggle"> </span>
        <span className="fm-tree-icon"><Home size={14} /></span>
        <span className="fm-tree-name">Home</span>
      </div>
      {tree.map((node) => renderNode(node))}
    </div>
  )
}

function updateChildren(nodes: TreeNode[], targetPath: string, children: TreeNode[]): boolean {
  for (const node of nodes) {
    if (node.path === targetPath) {
      node.children = children
      return true
    }
    if (updateChildren(node.children, targetPath, children)) return true
  }
  return false
}

function findNode(nodes: TreeNode[], targetPath: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node
    const found = findNode(node.children, targetPath)
    if (found) return found
  }
  return null
}
