import { visit } from 'unist-util-visit'
import type { Plugin } from 'unified'
import type { Root, Text, Link, PhrasingContent, Node } from 'mdast'

const FILE_PATH_RE = /(\/[\w.\-/]+)/g

export const remarkFilePaths: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return
      // Skip text inside code blocks — cast parent to check its type
      const parentNode = parent as unknown as Node
      if (parentNode.type === 'code' || parentNode.type === 'inlineCode') return

      const value = node.value
      const parts = value.split(FILE_PATH_RE)
      if (parts.length === 1) return

      const newNodes: PhrasingContent[] = []
      for (const part of parts) {
        if (!part) continue
        FILE_PATH_RE.lastIndex = 0
        if (FILE_PATH_RE.test(part)) {
          FILE_PATH_RE.lastIndex = 0
          const link: Link = {
            type: 'link',
            url: `/workspace?path=${encodeURIComponent(part)}`,
            children: [{ type: 'text', value: part }],
          }
          newNodes.push(link)
        } else {
          newNodes.push({ type: 'text', value: part })
        }
      }
      FILE_PATH_RE.lastIndex = 0

      if (newNodes.length > 0 && 'children' in parent) {
        const children = parent.children as PhrasingContent[]
        children.splice(index, 1, ...newNodes)
        return index + newNodes.length
      }
    })
  }
}
