import { getAgents } from '@/lib/workspace'
import WorkspaceBrowser from '@/components/WorkspaceBrowser'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage() {
  const agents = await getAgents()

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Workspace</h2>
      <WorkspaceBrowser agents={agents} />
    </div>
  )
}
