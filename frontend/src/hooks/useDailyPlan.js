import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { listenPlan } from '../features/planner/plannerApi.js';

/** Live daily plan document for a given local day. */
export function useDailyPlan(localDate) {
  const { user } = useAuth();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || !localDate) return undefined;
    setLoading(true);
    const unsub = listenPlan(
      user.uid,
      localDate,
      (doc) => {
        setPlan(doc);
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

  return { plan, loading, error };
}
