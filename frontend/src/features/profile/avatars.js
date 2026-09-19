/**
 * Built-in fun avatars — an emoji on a vibrant gradient, rendered as inline SVG
 * (no external calls, always available, crisp at any size). Stored on the profile as
 * `avatarId`; the <Avatar> component resolves it.
 */
export const AVATARS = [
  { id: 'fox', emoji: '🦊', colors: ['#f97316', '#ef4444'] },
  { id: 'frog', emoji: '🐸', colors: ['#22c55e', '#15803d'] },
  { id: 'rocket', emoji: '🚀', colors: ['#6366f1', '#4338ca'] },
  { id: 'alien', emoji: '👾', colors: ['#8b5cf6', '#6d28d9'] },
  { id: 'unicorn', emoji: '🦄', colors: ['#ec4899', '#8b5cf6'] },
  { id: 'panda', emoji: '🐼', colors: ['#64748b', '#1e293b'] },
  { id: 'fire', emoji: '🔥', colors: ['#f59e0b', '#dc2626'] },
  { id: 'taco', emoji: '🌮', colors: ['#eab308', '#b45309'] },
  { id: 'dino', emoji: '🦖', colors: ['#10b981', '#047857'] },
  { id: 'ufo', emoji: '🛸', colors: ['#06b6d4', '#2563eb'] },
  { id: 'ghost', emoji: '👻', colors: ['#a78bfa', '#7c3aed'] },
  { id: 'robot', emoji: '🤖', colors: ['#0ea5e9', '#4f46e5'] },
  { id: 'cat', emoji: '🐱', colors: ['#fb923c', '#f43f5e'] },
  { id: 'pizza', emoji: '🍕', colors: ['#f97316', '#eab308'] },
];

export function getAvatar(id) {
  return AVATARS.find((a) => a.id === id) ?? null;
}
