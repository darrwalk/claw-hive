import { getActiveTasks } from '@/lib/tasks';
import { KanbanBoard } from '@/components/KanbanBoard';
import { Refresher } from '@/components/Refresher';

export const dynamic = 'force-dynamic';

export default function TasksPage() {
  const tasks = getActiveTasks();

  return (
    <div>
      <Refresher interval={15000} />
      <div style={{ padding: '16px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Task Board</h1>
        <span style={{ color: '#6c7086', fontSize: '12px' }}>{tasks.length} tasks · auto-refresh 15s</span>
      </div>
      <KanbanBoard tasks={tasks} />
    </div>
  );
}
