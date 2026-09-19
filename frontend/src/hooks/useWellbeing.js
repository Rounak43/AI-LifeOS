import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { listenSleep, listenMood, listenWorkouts } from '../features/wellbeing/wellbeingApi.js';

/** Live sleep, mood and workouts for a given local day. */
export function useWellbeing(localDate) {
  const { user } = useAuth();
  const [sleep, setSleep] = useState(null);
  const [mood, setMood] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !localDate) return undefined;
    setLoading(true);
    let ready = 0;
    const done = () => {
      ready += 1;
      if (ready >= 3) setLoading(false);
    };
    const u1 = listenSleep(user.uid, localDate, (d) => { setSleep(d); done(); }, done);
    const u2 = listenMood(user.uid, localDate, (d) => { setMood(d); done(); }, done);
    const u3 = listenWorkouts(user.uid, localDate, (d) => { setWorkouts(d); done(); }, done);
    return () => { u1(); u2(); u3(); };
  }, [user, localDate]);

  return { sleep, mood, workouts, loading };
}
