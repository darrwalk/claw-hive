import { getActiveTasks, getTaskCounts, getProjects } from '@/lib/tasks';
import type { TaskStatus } from '@/lib/tasks';
import { ProjectProgress } from '@/components/ProjectProgress';
import { Refresher } from '@/components/Refresher';

export const dynamic = 'force-dynamic';

const statusStyles: Record<TaskStatus, { bg: string; color: string }> = {
  pending: { bg: '#f9e2af', color: '#1e1e2e' },
  in_progress: { bg: '#89b4fa', color: '#1e1e2e' },
  blocked: { bg: '#f38ba8', color: '#1e1e2e' },
  completed: { bg: '#a6e3a1', color: '#1e1e2e' },
  failed: { bg: '#eba0ac', color: '#1e1e2e' },
};

export default function Home() {
  const tasks = getActiveTasks();
  const counts = getTaskCounts(tasks);
  const projects = getProjects();

  const blockedTasks = tasks.filter(t => t.status === 'blocked');
  const recentCompleted = tasks
    .filter(t => t.status === 'completed')
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))
    .slice(0, 5);

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <Refresher interval={15000} />

      <h1 style={{ fontSize: '20px', marginBottom: '20px', fontWeight: 600 }}>Overview</h1>

      {/* Status counts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {(Object.entries(counts) as [TaskStatus, number][]).map(([status, count]) => (
          <div key={status} style={{
            background: '#1e1e2e',
            border: '1px solid #313244',
            borderRadius: '8px',
            padding: '16px',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: '28px',
              fontWeight: 700,
              color: statusStyles[status].bg,
            }}>{count}</div>
            <div style={{
              fontSize: '12px',
              color: '#a6adc8',
              textTransform: 'capitalize',
            }}>{status.replace('_', ' ')}</div>
          </div>
        ))}
      </div>

      {/* Blocked alerts */}
      {blockedTasks.length > 0 && (
        <div style={{
          background: '#302030',
          border: '1px solid #f38ba8',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
        }}>
          <h2 style={{ fontSize: '14px', color: '#f38ba8', marginTop: 0, marginBottom: '8px' }}>
            Blocked — needs your attention
          </h2>
          {blockedTasks.map(t => (
            <div key={t.task_id} style={{ marginBottom: '6px', fontSize: '13px' }}>
              <span style={{ color: '#cdd6f4' }}>{t.title}</span>
              {t.human_input?.needed && (
                <span style={{ color: '#f9e2af', marginLeft: '8px' }}>— {t.human_input.needed}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '12px', fontWeight: 600 }}>Projects</h2>
          {projects.map(p => (
            <ProjectProgress key={p.project_id} project={p} tasks={tasks} />
          ))}
        </div>
      )}

      {/* Recent completions */}
      {recentCompleted.length > 0 && (
        <div>
          <h2 style={{ fontSize: '16px', marginBottom: '12px', fontWeight: 600 }}>Recent Completions</h2>
          {recentCompleted.map(t => (
            <div key={t.task_id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: '1px solid #313244',
              fontSize: '13px',
            }}>
              <span style={{ color: '#a6e3a1' }}>✅ {t.title}</span>
              <span style={{ color: '#6c7086' }}>{t.owner || ''}</span>
            </div>
          ))}
        </div>
      )}

      {tasks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#45475a' }}>
          No tasks yet. Create one with <code>hive-cli create</code>
        </div>
      )}
    </div>
  );
}
