/**
 * Default avatar pool for users without custom avatars
 */
const buildAvatarDataUrl = (background, accent, label) => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="28" y1="20" x2="228" y2="236" gradientUnits="userSpaceOnUse">
      <stop stop-color="${background[0]}"/>
      <stop offset="1" stop-color="${background[1]}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="64" fill="url(#bg)"/>
  <circle cx="128" cy="112" r="54" fill="white" fill-opacity="0.9"/>
  <circle cx="108" cy="102" r="8" fill="${accent}"/>
  <circle cx="148" cy="102" r="8" fill="${accent}"/>
  <path d="M104 132c10 16 38 16 48 0" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>
  <circle cx="128" cy="172" r="62" fill="white" fill-opacity="0.28"/>
  <text x="128" y="184" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="${accent}">${label}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
};

const DEFAULT_AVATARS = [
  buildAvatarDataUrl(['#F78FB3', '#FDE2E4'], '#C44569', 'M'),
  buildAvatarDataUrl(['#55EFC4', '#E8FFF8'], '#0F766E', 'B'),
  buildAvatarDataUrl(['#778BEB', '#E4E7FF'], '#4B4E6D', 'L'),
  buildAvatarDataUrl(['#F6BD60', '#FAEDCD'], '#9C6644', 'P'),
  buildAvatarDataUrl(['#A29BFE', '#F3E8FF'], '#6C5CE7', 'T'),
  buildAvatarDataUrl(['#3DC1D3', '#DFF9FB'], '#227093', 'S'),
  buildAvatarDataUrl(['#FF8A5B', '#FFD3B6'], '#6C5CE7', 'D'),
];

/**
 * Get a deterministic default avatar based on user identifier
 * Same user always gets the same avatar
 * @param {string} identifier - User email, username, or ID
 * @returns {string} Avatar URL
 */
const getDefaultAvatar = (identifier = '') => {
  const key = String(identifier || 'default');
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % DEFAULT_AVATARS.length;
  return DEFAULT_AVATARS[idx];
};

/**
 * Get a random default avatar
 * @returns {string} Avatar URL
 */
const getRandomDefaultAvatar = () => {
  const idx = Math.floor(Math.random() * DEFAULT_AVATARS.length);
  return DEFAULT_AVATARS[idx];
};

module.exports = {
  DEFAULT_AVATARS,
  getDefaultAvatar,
  getRandomDefaultAvatar,
};
