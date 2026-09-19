/**
 * Fun anonymous handle generator — every account gets a playful identity by default
 * (privacy-friendly and a bit of personality). e.g. "Cosmic Otter 47".
 */
const ADJECTIVES = [
  'Cosmic', 'Neon', 'Velvet', 'Midnight', 'Turbo', 'Sneaky', 'Jolly', 'Feral',
  'Quantum', 'Groovy', 'Rogue', 'Electric', 'Salty', 'Mystic', 'Wandering',
  'Caffeinated', 'Fuzzy', 'Dizzy', 'Spicy', 'Lucky',
];

const CREATURES = [
  'Otter', 'Penguin', 'Fox', 'Yeti', 'Panda', 'Raccoon', 'Narwhal', 'Gecko',
  'Moose', 'Falcon', 'Axolotl', 'Wombat', 'Platypus', 'Dragon', 'Koala',
  'Sloth', 'Meerkat', 'Pigeon', 'Walrus', 'Hedgehog',
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function generateAnonymousName() {
  const num = Math.floor(Math.random() * 90) + 10; // 10..99
  return `${pick(ADJECTIVES)} ${pick(CREATURES)} ${num}`;
}
