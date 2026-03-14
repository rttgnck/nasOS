import { useCallback, useEffect, useState } from 'react'
import { Folder, Home, HardDrive, ChevronRight, ChevronDown } from 'lucide-react'
import { api } from '../../hooks/useApi'

interface TreeNode {
  name: string
  path: string
  children: TreeNode[]
  has_children: boolean | null
}

interface BrowseRoot {
  id: string
  name: string
  path: string
  icon: string
  description?: string
  protocol?: string
}

interface FileTreeProps {
  currentPath: string
  onNavigate: (path: string) => void
}

export function FileTree({ currentPath, onNavigate }: FileTreeProps) {
  const [roots, setRoots] = useState<BrowseRoot[]>([])
  const [treesMap, setTreesMap] = useState<Record<string, TreeNode[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']))

  // Load browsable roots
  useEffect(() => {
    api<{ roots: BrowseRoot[] }>('/api/files/roots')
      .then((data) => setRoots(data.roots))
      .catch(() => setRoots([{ id: 'home', name: 'Home', path: '', icon: 'home' }]))
  }, [])

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

  // Load initial tree for each root when roots arrive
  useEffect(() => {
    if (roots.length === 0) return
    const loadAll = async () => {
      const newMap: Record<string, TreeNode[]> = {}
      for (const root of roots) {
        try {
          const children = await loadTree(root.path)
          newMap[root.id] = children
        } catch {
          newMap[root.id] = []
        }
      }
      setTreesMap(newMap)
    }
    loadAll()
  }, [roots, loadTree])

  // Auto-expand ancestors when currentPath changes
  useEffect(() => {
    if (!currentPath) return

    const matchingRoot = roots.find((r) => r.path && currentPath.startsWith(r.path))
    const rootId = matchingRoot?.id ?? 'home'
    const rootPath = matchingRoot?.path ?? ''

    const relPath = rootPath ? currentPath.slice(rootPath.length).replace(/^\//, '') : currentPath
    if (!relPath) return

    const segments = relPath.split('/').filter(Boolean)
    const ancestors: string[] = []
    for (let i = 0; i < segments.length; i++) {
      const ancestorRel = segments.slice(0, i + 1).join('/')
      ancestors.push(rootPath ? `${rootPath}/${ancestorRel}` : ancestorRel)
    }

    const expandAncestors = async () => {
      const next = new Set(expanded)
      next.add(rootId)
      const currentTree = treesMap[rootId] ?? []

      for (const ancestor of ancestors) {
        next.add(ancestor)
        const node = findNode(currentTree, ancestor)
        if (node && node.children.length === 0 && node.has_children !== false) {
          const children = await loadTree(node.path)
          updateChildren(currentTree, node.path, children)
          node.children = children
        }
      }
      setTreesMap((prev) => ({ ...prev, [rootId]: [...currentTree] }))
      setExpanded(next)
    }
    expandAncestors()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, roots])

  const toggleExpand = async (nodeOrRootId: string, node?: TreeNode) => {
    const next = new Set(expanded)
    const key = node ? node.path : nodeOrRootId

    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
      if (node && node.children.length === 0 && node.has_children !== false) {
        const children = await loadTree(node.path)
        const rootId = roots.find((r) => r.path && node.path.startsWith(r.path))?.id ?? 'home'
        const currentTree = treesMap[rootId] ?? []
        updateChildren(currentTree, node.path, children)
        setTreesMap((prev) => ({ ...prev, [rootId]: [...currentTree] }))
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
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          data-active={isActive}
          onClick={() => onNavigate(node.path)}
        >
          <span
            className="fm-tree-toggle"
            onClick={(e) => { e.stopPropagation(); toggleExpand(node.path, node) }}
          >
            {hasKids ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span style={{ width: 12 }} />}
          </span>
          <span className="fm-tree-icon"><Folder size={14} /></span>
          <span className="fm-tree-name">{node.name}</span>
        </div>
        {isExpanded && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  const renderRoot = (root: BrowseRoot) => {
    const isActive = root.path === '' ? currentPath === '' : currentPath === root.path
    const isExpanded = expanded.has(root.id)
    const tree = treesMap[root.id] ?? []
    const hasChildren = tree.length > 0

    const RootIcon = root.icon === 'home' ? Home : HardDrive

    return (
      <div key={root.id} className="fm-tree-root-group">
        <div
          className="fm-tree-item fm-tree-root-item"
          data-active={isActive}
          onClick={() => onNavigate(root.path)}
        >
          <span
            className="fm-tree-toggle"
            onClick={(e) => {
              e.stopPropagation()
              const next = new Set(expanded)
              if (next.has(root.id)) next.delete(root.id)
              else next.add(root.id)
              setExpanded(next)
            }}
          >
            {hasChildren
              ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
              : <span style={{ width: 12 }} />}
          </span>
          <span className="fm-tree-icon"><RootIcon size={14} /></span>
          <span className="fm-tree-name">{root.name}</span>
        </div>
        {isExpanded && tree.map((node) => renderNode(node, 1))}
      </div>
    )
  }

  return (
    <div className="fm-tree">
      {roots.map(renderRoot)}
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
