import { getProjects, getActiveTasks } from '@/lib/tasks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import ProjectActions from '@/components/ProjectActions'
import ProjectEditButton from '@/components/ProjectEditButton'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const [projects, tasks] = await Promise.all([getProjects(), getActiveTasks()])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Projects</h2>
        <ProjectActions />
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No projects</div>
      ) : (
        <div className="space-y-4">
          {projects.map(project => {
            const projectTasks = tasks.filter(t => t.project_id === project.project_id)
            const completed = projectTasks.filter(t => t.status === 'completed').length
            const total = projectTasks.length || project.tasks.length
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0

            return (
              <Card key={project.project_id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{project.title}</CardTitle>
                      <ProjectEditButton project={project} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                        {project.status}
                      </Badge>
                      <span className="text-sm font-mono text-muted-foreground">{pct}%</span>
                    </div>
                  </div>
                  {project.description && (
                    <p className="text-sm text-muted-foreground">{project.description}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="w-full bg-secondary rounded-full h-1.5 mb-4">
                    <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="space-y-2">
                    {(projectTasks.length > 0 ? projectTasks : project.tasks.map(t => ({ ...t, status: 'pending' as const }))).map((t: any) => (
                      <div key={t.task_id} className="flex items-center justify-between rounded bg-secondary/50 px-3 py-2 text-sm">
                        <Link href={`/tasks/${t.task_id}`} className="hover:text-primary transition-colors">
                          {t.title}
                        </Link>
                        <Badge variant="outline" className="text-[10px]">{(t.status || 'pending').replace('_', ' ')}</Badge>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-3">{project.project_id}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
