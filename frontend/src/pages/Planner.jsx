import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToday } from '../hooks/useToday.js';
import { useDailyPlan } from '../hooks/useDailyPlan.js';
import { useTasks } from '../hooks/useTasks.js';
import {
  savePlanBlocks,
  makeBlock,
  sortBlocks,
  getPlan,
  BLOCK_TYPES,
  BLOCK_PRIORITIES,
} from '../features/planner/plannerApi.js';
import { blockDurationMinutes } from '../features/scoring/computeDay.js';
import { formatLongDate, localDate, formatMinutes } from '../utils/time.js';
import TimePicker from '../components/TimePicker.jsx';
import styles from './Planner.module.css';

export default function Planner() {
  const { user } = useAuth();
  const { today, timezone } = useToday();
  const { plan, loading } = useDailyPlan(today);
  const { tasks } = useTasks(today);

  const [form, setForm] = useState({ title: '', start: '', end: '', type: 'focus', priority: 'medium', linkedTaskId: '' });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const blocks = useMemo(() => sortBlocks(plan?.timeBlocks ?? []), [plan]);
  const taskTitleById = useMemo(() => {
    const m = new Map();
    for (const t of tasks) m.set(t.id, t.title);
    return m;
  }, [tasks]);

  const persist = (next) => savePlanBlocks(user.uid, today, next);
  const updateBlock = (id, patch) =>
    persist((plan?.timeBlocks ?? []).map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const removeBlock = (id) => persist((plan?.timeBlocks ?? []).filter((b) => b.id !== id));

  async function addBlock(e) {
    e.preventDefault();
    setFormError('');
    const { title, start, end, type, priority, linkedTaskId } = form;
    if (!title.trim() || !start || !end) return setFormError('Title, start and end are required.');
    if (end <= start) return setFormError('End time must be after start time.');

    setBusy(true);
    try {
      const block = makeBlock({
        title: title.trim(),
        start,
        end,
        type,
        priority,
        linkedTaskId: linkedTaskId || null,
      });
      await persist([...(plan?.timeBlocks ?? []), block]);
      setForm({ title: '', start: '', end: '', type: 'focus', priority: 'medium', linkedTaskId: '' });
    } finally {
      setBusy(false);
    }
  }

  async function duplicateYesterday() {
    setBusy(true);
    setFormError('');
    try {
      const yesterday = localDate(timezone, new Date(Date.now() - 24 * 60 * 60 * 1000));
      const prev = await getPlan(user.uid, yesterday);
      const prevBlocks = prev?.timeBlocks ?? [];
      if (prevBlocks.length === 0) {
        setFormError('No plan found for yesterday to duplicate.');
        return;
      }
      // Copy the shape, but reset capture state and give fresh ids.
      const copies = prevBlocks.map((b) =>
        makeBlock({ title: b.title, start: b.start, end: b.end, type: b.type, priority: b.priority, linkedTaskId: null })
      );
      await persist([...(plan?.timeBlocks ?? []), ...copies]);
    } finally {
      setBusy(false);
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Daily Planner</h1>
          <p className="muted">{formatLongDate(timezone)}</p>
        </div>
        <button className="btn btn-secondary" onClick={duplicateYesterday} disabled={busy}>
          Duplicate yesterday
        </button>
      </header>

      <form className={styles.form} onSubmit={addBlock}>
        <input
          className={`input ${styles.grow}`}
          placeholder="What’s this block? e.g. DSA practice"
          value={form.title}
          onChange={set('title')}
          aria-label="Block title"
        />
        <TimePicker
          value={form.start}
          onChange={(v) => setForm((f) => ({ ...f, start: v }))}
          placeholder="Start"
          ariaLabel="Start time"
        />
        <span className={styles.dash}>–</span>
        <TimePicker
          value={form.end}
          onChange={(v) => setForm((f) => ({ ...f, end: v }))}
          placeholder="End"
          ariaLabel="End time"
        />
        <select className="input" value={form.type} onChange={set('type')} aria-label="Type">
          {BLOCK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="input" value={form.priority} onChange={set('priority')} aria-label="Priority" title="High priority = a key step">
          {BLOCK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p === 'high' ? '★ High (key)' : p}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={form.linkedTaskId}
          onChange={set('linkedTaskId')}
          aria-label="Link a task"
        >
          <option value="">No task</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <button className="btn" type="submit" disabled={busy}>
          Add block
        </button>
      </form>
      {formError && <p className={styles.error}>{formError}</p>}

      {loading ? (
        <p className="muted">Loading your plan…</p>
      ) : blocks.length === 0 ? (
        <div className={`card ${styles.empty}`}>
          <div className={styles.emptyEmoji}>🗓️</div>
          <div className={styles.emptyTitle}>Plan your first day</div>
          <p className="muted">
            Block out your day above. Then, as the day goes on, tap <strong>Done</strong> or{' '}
            <strong>Missed</strong> on each block. That one-tap capture is the heart of AI LifeOS.
          </p>
        </div>
      ) : (
        <ul className={styles.timeline}>
          {blocks.map((b) => (
            <BlockRow
              key={b.id}
              block={b}
              linkedTitle={b.linkedTaskId ? taskTitleById.get(b.linkedTaskId) : null}
              onDone={() =>
                updateBlock(b.id, {
                  status: 'done',
                  actualMinutes: b.actualMinutes ?? blockDurationMinutes(b),
                })
              }
              onMissed={() => updateBlock(b.id, { status: 'missed', actualMinutes: 0 })}
              onClear={() => updateBlock(b.id, { status: null, actualMinutes: null })}
              onActual={(mins) => updateBlock(b.id, { actualMinutes: mins })}
              onEdit={(patch) => updateBlock(b.id, patch)}
              onDelete={() => removeBlock(b.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BlockRow({ block, linkedTitle, onDone, onMissed, onClear, onActual, onEdit, onDelete }) {
  const planned = blockDurationMinutes(block);
  const captured = block.status === 'done' || block.status === 'missed';
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className={styles.block}>
        <BlockEditForm
          block={block}
          onCancel={() => setEditing(false)}
          onSave={(patch) => {
            onEdit(patch);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className={`${styles.block} ${block.status ? styles[`st_${block.status}`] : ''}`}>
      <div className={styles.when}>
        <span className={styles.time}>{block.start}</span>
        <span className={styles.timeEnd}>{block.end}</span>
      </div>

      <div className={styles.info}>
        <span className={styles.blockTitle}>{block.title}</span>
        <span className={styles.tags}>
          {block.priority === 'high' && <span className={styles.keyTag}>★ Key</span>}
          <span className={styles.type}>{block.type}</span>
          <span className="muted">· planned {formatMinutes(planned)}</span>
          {linkedTitle && <span className={styles.link}>↳ {linkedTitle}</span>}
        </span>
      </div>

      <div className={styles.capture}>
        <button className={styles.del} onClick={() => setEditing(true)} title="Edit block">
          ✎
        </button>
        {block.status === 'done' && (
          <label className={styles.actual}>
            actual
            <ActualInput
              key={`${block.id}-${block.actualMinutes}`}
              defaultValue={block.actualMinutes ?? planned}
              onCommit={onActual}
            />
            m
          </label>
        )}

        {!captured ? (
          <div className={styles.captureBtns}>
            <button className={`${styles.cap} ${styles.done}`} onClick={onDone}>
              ✓ Done
            </button>
            <button className={`${styles.cap} ${styles.missed}`} onClick={onMissed}>
              ✕ Missed
            </button>
          </div>
        ) : (
          <button className={styles.clear} onClick={onClear} title="Undo capture">
            {block.status === 'done' ? 'Done' : 'Missed'} · undo
          </button>
        )}

        <button className={styles.del} onClick={onDelete} title="Delete block">
          🗑
        </button>
      </div>
    </li>
  );
}

function BlockEditForm({ block, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: block.title ?? '',
    start: block.start ?? '',
    end: block.end ?? '',
    type: block.type ?? 'focus',
    priority: block.priority ?? 'medium',
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function save(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.start || !form.end) return setErr('Title, start and end are required.');
    if (form.end <= form.start) return setErr('End must be after start.');
    onSave({ title: form.title.trim(), start: form.start, end: form.end, type: form.type, priority: form.priority });
  }

  return (
    <form className={styles.editForm} onSubmit={save}>
      <div className={styles.editRow}>
        <input className={`input ${styles.grow}`} value={form.title} onChange={set('title')} autoFocus aria-label="Title" />
        <TimePicker value={form.start} onChange={(v) => setForm((f) => ({ ...f, start: v }))} placeholder="Start" ariaLabel="Start time" />
        <TimePicker value={form.end} onChange={(v) => setForm((f) => ({ ...f, end: v }))} placeholder="End" ariaLabel="End time" />
        <select className="input" value={form.type} onChange={set('type')} aria-label="Type">
          {BLOCK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="input" value={form.priority} onChange={set('priority')} aria-label="Priority">
          {BLOCK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p === 'high' ? '★ High (key)' : p}
            </option>
          ))}
        </select>
      </div>
      {err && <p className={styles.error}>{err}</p>}
      <div className={styles.editActions}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn">
          Save
        </button>
      </div>
    </form>
  );
}

function ActualInput({ defaultValue, onCommit }) {
  const [value, setValue] = useState(String(defaultValue ?? ''));
  const commit = () => {
    const n = Math.max(0, Math.round(Number(value) || 0));
    onCommit(n);
  };
  return (
    <input
      className={styles.actualInput}
      type="number"
      min="0"
      step="5"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      aria-label="Actual minutes"
    />
  );
}
