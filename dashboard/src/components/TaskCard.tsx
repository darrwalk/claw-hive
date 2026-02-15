'use client';

import type { Task } from '@/lib/tasks';

const statusEmoji: Record<string, string> = {
  pending: '⏳',
  in_progress: '🔄',
  blocked: '🚫',
  completed: '✅',
  failed: '❌',
};

const typeColors: Record<string, string> = {
  research: '#3b82f6',
  dev: '#8b5cf6',
};

export function TaskCard({ task }: { task: Task }) {
  const lastLog = task.log[task.log.length - 1];
  const duration = getDuration(task);

  return (
    <div style={{
      background: '#1e1e2e',
      border: '1px solid #313244',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '8px',
      fontSize: '13px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <span style={{ fontWeight: 600, color: '#cdd6f4', flex: 1 }}>{task.title}</span>
        <span style={{
          background: typeColors[task.type] || '#6c7086',
          color: '#fff',
          padding: '1px 6px',
          borderRadius: '4px',
          fontSize: '11px',
          marginLeft: '6px',
          whiteSpace: 'nowrap',
        }}>{task.type}</span>
      </div>

      <div style={{ color: '#a6adc8', fontSize: '11px', marginBottom: '4px' }}>
        {task.task_id}
      </div>

      {task.owner && (
        <div style={{ color: '#94e2d5', fontSize: '12px', marginBottom: '4px' }}>
          {task.owner} {duration && `· ${duration}`}
        </div>
      )}

      {task.blocked_on === 'human' && task.human_input?.needed && (
        <div style={{
          background: '#45475a',
          padding: '6px 8px',
          borderRadius: '4px',
          marginTop: '6px',
          color: '#f9e2af',
          fontSize: '12px',
        }}>
          Needs: {task.human_input.needed}
        </div>
      )}

      {lastLog && (
        <div style={{ color: '#6c7086', fontSize: '11px', marginTop: '6px', fontStyle: 'italic' }}>
          {lastLog.detail.slice(0, 80)}{lastLog.detail.length > 80 ? '...' : ''}
        </div>
      )}
    </div>
  );
}

function getDuration(task: Task): string | null {
  if (!task.claimed_at) return null;
  const start = new Date(task.claimed_at).getTime();
  const end = task.completed_at ? new Date(task.completed_at).getTime() : Date.now();
  const min = Math.round((end - start) / 60000);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ${min % 60}m`;
}
