import { useCallback, useEffect, useState } from 'react'
import { Folder, Home, HardDrive, Share2, Disc, ChevronRight, ChevronDown } from 'lucide-react'
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['', '_disks', '_shares']))

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
      if (matchingRoot?.icon === 'disk') next.add('_disks')
      if (matchingRoot?.icon === 'share') next.add('_shares')
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

  const renderRoot = (root: BrowseRoot, depth: number = 0) => {
    const isActive = root.path === '' ? currentPath === '' : currentPath === root.path
    const isExpanded = expanded.has(root.id)
    const tree = treesMap[root.id] ?? []
    const hasChildren = tree.length > 0

    const RootIcon = root.icon === 'home' ? Home
      : root.icon === 'disk' ? Disc
      : root.icon === 'share' ? Share2
      : HardDrive

    return (
      <div key={root.id}>
        <div
          className="fm-tree-item"
          style={{ paddingLeft: `${12 + depth * 16}px` }}
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
        {isExpanded && tree.map((node) => renderNode(node, depth + 1))}
      </div>
    )
  }

  const toggleSection = (key: string) => {
    const next = new Set(expanded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setExpanded(next)
  }

  const homeRoot = roots.find((r) => r.icon === 'home')
  const diskRoots = roots.filter((r) => r.icon === 'disk')
  const shareRoots = roots.filter((r) => r.icon === 'share')

  return (
    <div className="fm-tree">
      {/* Home — always at top */}
      {homeRoot && (
        <div className="fm-tree-root-group">
          {renderRoot(homeRoot)}
        </div>
      )}

      {/* Disks section */}
      {diskRoots.length > 0 && (
        <div className="fm-tree-root-group">
          <div
            className="fm-tree-item fm-tree-section-header"
            onClick={() => toggleSection('_disks')}
          >
            <span className="fm-tree-toggle">
              {expanded.has('_disks') ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <span className="fm-tree-icon"><HardDrive size={14} /></span>
            <span className="fm-tree-name" style={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.6 }}>Disks</span>
          </div>
          {expanded.has('_disks') && diskRoots.map((r) => renderRoot(r, 1))}
        </div>
      )}

      {/* Shares section */}
      {shareRoots.length > 0 && (
        <div className="fm-tree-root-group">
          <div
            className="fm-tree-item fm-tree-section-header"
            onClick={() => toggleSection('_shares')}
          >
            <span className="fm-tree-toggle">
              {expanded.has('_shares') ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <span className="fm-tree-icon"><Share2 size={14} /></span>
            <span className="fm-tree-name" style={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.6 }}>Shares</span>
          </div>
          {expanded.has('_shares') && shareRoots.map((r) => renderRoot(r, 1))}
        </div>
      )}
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
