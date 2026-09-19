import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { listenTasksForDate } from '../features/tasks/tasksApi.js';

/** Live tasks for a given local day. */
export function useTasks(localDate) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || !localDate) return undefined;
    setLoading(true);
    const unsub = listenTasksForDate(
      user.uid,
      localDate,
      (items) => {
        setTasks(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [user, localDate]);

  return { tasks, loading, error };
}
