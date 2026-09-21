import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { listenFocusSessions, listenScreenTime } from '../features/focus/focusApi.js';

/** Live focus sessions and self-logged screen time for a given local day. */
export function useFocus(localDate) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [screenTime, setScreenTime] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !localDate) return undefined;
    setLoading(true);
    let ready = 0;
    const done = () => {
      ready += 1;
      if (ready >= 2) setLoading(false);
    };
    const u1 = listenFocusSessions(
      user.uid,
      localDate,
      (items) => {
        setSessions(items);
        done();
      },
      done
    );
    const u2 = listenScreenTime(
      user.uid,
      localDate,
      (d) => {
        setScreenTime(d);
        done();
      },
      done
    );
    return () => {
      u1();
      u2();
    };
  }, [user, localDate]);

  return { sessions, screenTime, loading };
}
