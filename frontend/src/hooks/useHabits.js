import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { listenHabits } from '../features/habits/habitsApi.js';

/** Live list of the user's habits. */
export function useHabits() {
  const { user } = useAuth();
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return undefined;
    setLoading(true);
    const unsub = listenHabits(
      user.uid,
      (items) => {
        setHabits(items);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user]);

  return { habits, loading };
}
