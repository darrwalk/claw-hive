import { getAgents } from '@/lib/workspace'
import WorkspaceBrowser from '@/components/WorkspaceBrowser'

export const dynamic = 'force-dynamic'

interface WorkspacePageProps {
  searchParams: { path?: string }
}

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const agents = await getAgents()
  const initialPath = searchParams.path ?? null

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Workspace</h2>
      <WorkspaceBrowser agents={agents} initialPath={initialPath} />
    </div>
  )
}
