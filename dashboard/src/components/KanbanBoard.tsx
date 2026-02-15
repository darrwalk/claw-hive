'use client';

import type { Task, TaskStatus } from '@/lib/tasks';
import { TaskCard } from './TaskCard';

const columns: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'pending', label: 'Pending', color: '#f9e2af' },
  { status: 'in_progress', label: 'In Progress', color: '#89b4fa' },
  { status: 'blocked', label: 'Blocked', color: '#f38ba8' },
  { status: 'completed', label: 'Completed', color: '#a6e3a1' },
  { status: 'failed', label: 'Failed', color: '#eba0ac' },
];

export function KanbanBoard({ tasks }: { tasks: Task[] }) {
  const grouped = Object.groupBy(tasks, t => t.status);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: '12px',
      padding: '16px',
      minHeight: 'calc(100vh - 120px)',
    }}>
      {columns.map(col => {
        const colTasks = (grouped[col.status] || []) as Task[];
        return (
          <div key={col.status} style={{
            background: '#181825',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: `2px solid ${col.color}`,
            }}>
              <span style={{ color: col.color, fontWeight: 700, fontSize: '14px' }}>
                {col.label}
              </span>
              <span style={{
                background: col.color,
                color: '#1e1e2e',
                borderRadius: '10px',
                padding: '1px 8px',
                fontSize: '12px',
                fontWeight: 600,
              }}>
                {colTasks.length}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {colTasks.map(task => (
                <TaskCard key={task.task_id} task={task} />
              ))}
              {colTasks.length === 0 && (
                <div style={{ color: '#45475a', textAlign: 'center', padding: '20px', fontSize: '13px' }}>
                  No tasks
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
