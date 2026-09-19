import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import { LogoMark } from '../components/Logo.jsx';
import styles from './AppLayout.module.css';

// Full nav from the spec. Phase-2 items are live; later phases show as "Soon".
const NAV = [
  { to: '/', label: 'Dashboard', icon: '◧', end: true, ready: true },
  { to: '/planner', label: 'Daily Planner', icon: '▤', ready: true },
  { to: '/tasks', label: 'Tasks', icon: '✓', ready: true },
  { to: '/habits', label: 'Habits', icon: '↻', ready: true },
  { to: '/wellbeing', label: 'Wellbeing', icon: '❤', ready: true },
  { to: '/journal', label: 'Journal', icon: '✎', ready: true },
  { to: '/calendar', label: 'Calendar', icon: '▦', ready: true },
  { to: '/analytics', label: 'Analytics', icon: '◔', ready: true },
  { to: '/timeline', label: 'Life Timeline', icon: '⋮', ready: false },
  { to: '/coach', label: 'AI Coach', icon: '✦', ready: false },
  { to: '/settings', label: 'Settings', icon: '⚙', ready: true },
];

export default function AppLayout() {
  const { user, profile, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const barRef = useRef(null);

  const displayName = profile?.name || user?.displayName || user?.email || 'there';
  const current = NAV.find((n) => (n.end ? location.pathname === '/' : location.pathname.startsWith(n.to)));

  // Close the menu on route change.
  useEffect(() => setOpen(false), [location.pathname]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.barWrap} ref={barRef}>
          <div className={`${styles.bar} ${open ? styles.barOpen : ''}`}>
            <button
              className={styles.brand}
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label="Open menu"
            >
              <LogoMark size={30} />
              <span className={styles.brandName}>AI LifeOS</span>
              <span className={`${styles.chevron} ${open ? styles.chevronUp : ''}`}>⌄</span>
            </button>

            <div className={styles.barRight}>
              <span className={styles.currentPage}>{current?.label ?? ''}</span>
              <Link to="/settings" className={styles.avatarLink} title={displayName}>
                <Avatar profile={profile} size={34} />
              </Link>
            </div>
          </div>

          {open && (
            <div className={styles.menu} role="menu">
              <nav className={styles.menuGrid}>
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      [styles.item, isActive ? styles.active : '', !item.ready ? styles.soon : '']
                        .filter(Boolean)
                        .join(' ')
                    }
                    onClick={(e) => !item.ready && e.preventDefault()}
                    aria-disabled={!item.ready}
                  >
                    <span className={styles.itemIcon} aria-hidden>
                      {item.icon}
                    </span>
                    <span className={styles.itemLabel}>{item.label}</span>
                    {!item.ready && <span className={styles.soonTag}>Soon</span>}
                  </NavLink>
                ))}
              </nav>

              <div className={styles.menuFoot}>
                <div className={styles.footUser}>
                  <Avatar profile={profile} size={30} />
                  <span className={styles.footName} title={displayName}>
                    {displayName}
                  </span>
                </div>
                <button className={styles.signout} onClick={logout}>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.content} key={location.pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
