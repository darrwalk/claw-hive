'use client'

import { useState, useMemo } from 'react'
import { Task, groupByStatus } from '@/lib/types'
import TaskCard from './TaskCard'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search } from 'lucide-react'

const COLUMNS = [
  { key: 'pending', label: 'Pending', color: 'text-yellow-500' },
  { key: 'in_progress', label: 'In Progress', color: 'text-blue-500' },
  { key: 'blocked', label: 'Blocked', color: 'text-orange-500' },
  { key: 'completed', label: 'Completed', color: 'text-green-500' },
  { key: 'failed', label: 'Failed', color: 'text-red-500' },
] as const

interface Props {
  groups: Record<string, Task[]>
  allTasks: Task[]
  owners: string[]
  types: string[]
}

export default function KanbanBoard({ allTasks, owners, types }: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  const filtered = useMemo(() => {
    let tasks = allTasks
    if (search) tasks = tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    if (statusFilter !== 'all') tasks = tasks.filter(t => t.status === statusFilter)
    if (ownerFilter !== 'all') tasks = tasks.filter(t => t.owner === ownerFilter)
    if (typeFilter !== 'all') tasks = tasks.filter(t => t.type === typeFilter)
    return groupByStatus(tasks)
  }, [allTasks, search, statusFilter, ownerFilter, typeFilter])

  const visibleColumns = statusFilter === 'all'
    ? COLUMNS
    : COLUMNS.filter(c => c.key === statusFilter)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        {owners.length > 0 && (
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Owner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {types.length > 1 && (
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-4 md:grid min-h-[400px]" style={{ gridTemplateColumns: `repeat(${visibleColumns.length}, 1fr)` }}>
        {visibleColumns.map(col => (
          <div key={col.key} className="min-w-[280px] md:min-w-0 flex-shrink-0 md:flex-shrink rounded-lg border bg-card flex flex-col">
            <div className="flex items-center justify-between px-3 py-2.5 border-b">
              <span className={`text-xs font-semibold uppercase tracking-wider ${col.color}`}>{col.label}</span>
              <span className="text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
                {filtered[col.key]?.length ?? 0}
              </span>
            </div>
            <div className="p-2 space-y-2 overflow-y-auto flex-1">
              {(filtered[col.key] ?? []).map(task => (
                <TaskCard key={task.task_id} task={task} />
              ))}
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  )
}
