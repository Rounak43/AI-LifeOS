import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToday } from '../hooks/useToday.js';
import { useTasks } from '../hooks/useTasks.js';
import { createTask, updateTask, setTaskStatus, deleteTask } from '../features/tasks/tasksApi.js';
import { formatLongDate } from '../utils/time.js';
import styles from './Tasks.module.css';

const STATUS_ORDER = { in_progress: 0, pending: 1, completed: 2, missed: 3 };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export default function Tasks() {
  const { user } = useAuth();
  const { today, timezone } = useToday();
  const { tasks, loading, error } = useTasks(today);

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [estMinutes, setEstMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      if (s !== 0) return s;
      return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    });
  }, [tasks]);

  async function handleAdd(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    try {
      await createTask(user.uid, {
        title: t,
        priority,
        estMinutes: estMinutes ? Number(estMinutes) : undefined,
        localDate: today,
      });
      setTitle('');
      setEstMinutes('');
      setPriority('medium');
    } finally {
      setBusy(false);
    }
  }

  const toggleComplete = (task) =>
    setTaskStatus(user.uid, task.id, task.status === 'completed' ? 'pending' : 'completed');

  return (
    <div>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Tasks</h1>
          <p className="muted">{formatLongDate(timezone)}</p>
        </div>
      </header>

      <form className={styles.addRow} onSubmit={handleAdd}>
        <input
          className="input"
          placeholder="Add a task for today…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Task title"
        />
        <select
          className={`input ${styles.select}`}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          aria-label="Priority"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          className={`input ${styles.est}`}
          type="number"
          min="0"
          step="5"
          placeholder="est. min"
          value={estMinutes}
          onChange={(e) => setEstMinutes(e.target.value)}
          aria-label="Estimated minutes"
        />
        <button className="btn" type="submit" disabled={busy || !title.trim()}>
          Add
        </button>
      </form>

      {error && <p className={styles.error}>Couldn’t load tasks. Check your connection.</p>}

      {loading ? (
        <p className="muted">Loading tasks…</p>
      ) : sorted.length === 0 ? (
        <div className={`card ${styles.empty}`}>
          <div className={styles.emptyEmoji}>✓</div>
          <div className={styles.emptyTitle}>No tasks yet</div>
          <p className="muted">
            Add what you want to get done today. Completing or missing tasks is what powers
            your Planned vs Actual view.
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {sorted.map((task) =>
            editingId === task.id ? (
              <li key={task.id} className={styles.item}>
                <TaskEditForm
                  task={task}
                  onCancel={() => setEditingId(null)}
                  onSave={async (patch) => {
                    await updateTask(user.uid, task.id, patch);
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <li key={task.id} className={`${styles.item} ${styles[`s_${task.status}`] ?? ''}`}>
                <button
                  className={styles.check}
                  onClick={() => toggleComplete(task)}
                  aria-label={task.status === 'completed' ? 'Mark not done' : 'Mark done'}
                  title={task.status === 'completed' ? 'Mark not done' : 'Mark done'}
                >
                  {task.status === 'completed' ? '✓' : ''}
                </button>

                <div className={styles.body}>
                  <span className={styles.itemTitle}>{task.title}</span>
                  <span className={styles.meta}>
                    {task.priority === 'high' && <span className={styles.keyTag}>★ Key</span>}
                    <span className={`${styles.pri} ${styles[`p_${task.priority}`] ?? ''}`}>
                      {task.priority}
                    </span>
                    {task.category ? <span className={styles.cat}>{task.category}</span> : null}
                    {task.estMinutes ? <span className="muted">· est {task.estMinutes}m</span> : null}
                    {task.status === 'missed' && <span className={styles.missedTag}>missed</span>}
                  </span>
                  {task.notes ? <span className={styles.notes}>{task.notes}</span> : null}
                </div>

                <div className={styles.actions}>
                  <button className={styles.ghost} onClick={() => setEditingId(task.id)} title="Edit">
                    ✎
                  </button>
                  {task.status !== 'completed' && task.status !== 'missed' && (
                    <button
                      className={styles.ghost}
                      onClick={() => setTaskStatus(user.uid, task.id, 'missed')}
                      title="Mark missed"
                    >
                      ✕
                    </button>
                  )}
                  {(task.status === 'completed' || task.status === 'missed') && (
                    <button
                      className={styles.ghost}
                      onClick={() => setTaskStatus(user.uid, task.id, 'pending')}
                      title="Reopen"
                    >
                      ↺
                    </button>
                  )}
                  <button
                    className={styles.ghost}
                    onClick={() => deleteTask(user.uid, task.id)}
                    title="Delete"
                  >
                    🗑
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

function TaskEditForm({ task, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: task.title ?? '',
    priority: task.priority ?? 'medium',
    estMinutes: task.estMinutes ?? '',
    category: task.category ?? '',
    notes: task.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        priority: form.priority,
        estMinutes: form.estMinutes === '' ? null : Number(form.estMinutes),
        category: form.category.trim() || null,
        notes: form.notes.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.editForm} onSubmit={save}>
      <div className={styles.editRow}>
        <input
          className={`input ${styles.grow}`}
          value={form.title}
          onChange={set('title')}
          aria-label="Title"
          autoFocus
        />
        <select className={`input ${styles.select}`} value={form.priority} onChange={set('priority')}>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          className={`input ${styles.est}`}
          type="number"
          min="0"
          step="5"
          placeholder="est. min"
          value={form.estMinutes}
          onChange={set('estMinutes')}
          aria-label="Estimated minutes"
        />
      </div>
      <div className={styles.editRow}>
        <input
          className={`input ${styles.grow}`}
          placeholder="Category (optional)"
          value={form.category}
          onChange={set('category')}
        />
      </div>
      <textarea
        className="input"
        placeholder="Notes (optional)"
        rows={2}
        value={form.notes}
        onChange={set('notes')}
      />
      <div className={styles.editActions}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn" disabled={saving || !form.title.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
