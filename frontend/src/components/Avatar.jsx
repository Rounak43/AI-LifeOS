import { useId } from 'react';
import { getAvatar } from '../features/profile/avatars.js';

/**
 * Renders a user's avatar: a built-in emoji avatar (avatarId), an uploaded/linked
 * photo (photoURL), or initials as a fallback. Prefers avatarId over photoURL.
 */
export default function Avatar({ profile, avatarId, photoURL, name, size = 40, className }) {
  const uid = useId();
  const av = getAvatar(avatarId ?? profile?.avatarId);
  const photo = photoURL ?? profile?.photoURL;
  const label = name ?? profile?.name ?? profile?.anonymousName ?? '';
  const radius = Math.round(size * 0.28);
  const box = { width: size, height: size, borderRadius: radius, flex: '0 0 auto' };

  if (av) {
    const gid = `av-grad-${uid}`;
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={box}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={av.colors[0]} />
            <stop offset="1" stopColor={av.colors[1]} />
          </linearGradient>
        </defs>
        <rect width="100" height="100" rx="26" fill={`url(#${gid})`} />
        <text x="50" y="55" fontSize="52" textAnchor="middle" dominantBaseline="central">
          {av.emoji}
        </text>
      </svg>
    );
  }

  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        className={className}
        style={{ ...box, objectFit: 'cover', display: 'block' }}
      />
    );
  }

  const initial = (label || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={className}
      style={{
        ...box,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--surface-2)',
        color: 'var(--text-muted)',
        fontWeight: 600,
        fontSize: size * 0.42,
      }}
      aria-hidden
    >
      {initial}
    </div>
  );
}
