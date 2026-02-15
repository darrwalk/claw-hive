'use client';

import type { Project, Task } from '@/lib/tasks';

export function ProjectProgress({ project, tasks }: { project: Project; tasks: Task[] }) {
  const projectTasks = project.tasks
    .map(pt => tasks.find(t => t.task_id === pt.task_id))
    .filter((t): t is Task => t != null);

  const completed = projectTasks.filter(t => t.status === 'completed').length;
  const total = projectTasks.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div style={{
      background: '#1e1e2e',
      border: '1px solid #313244',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ color: '#cdd6f4', fontWeight: 600, fontSize: '14px' }}>{project.title}</span>
        <span style={{ color: '#a6adc8', fontSize: '13px' }}>{completed}/{total}</span>
      </div>
      <div style={{
        background: '#313244',
        borderRadius: '4px',
        height: '8px',
        overflow: 'hidden',
      }}>
        <div style={{
          background: pct === 100 ? '#a6e3a1' : '#89b4fa',
          height: '100%',
          width: `${pct}%`,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{ marginTop: '8px' }}>
        {projectTasks.map(t => (
          <div key={t.task_id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: '#a6adc8',
            marginBottom: '2px',
          }}>
            <span>{t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : t.status === 'in_progress' ? '🔄' : t.status === 'blocked' ? '🚫' : '⏳'}</span>
            <span>{t.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
