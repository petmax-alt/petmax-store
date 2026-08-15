// Hand-built flat icon set for Pet Max product categories.
// Two accent themes (orange / navy) so the grid doesn't feel monotone.
const ICONS = {
  food: (accent) => {
    const c = accent === 'navy' ? '#0E1F35' : '#F4622E';
    const c2 = accent === 'navy' ? '#294061' : '#D94E1F';
    return `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M55 70 L60 190 H140 L145 70 Z" fill="${c}"/>
      <path d="M50 40 C50 25 70 15 100 15 C130 15 150 25 150 40 L145 70 H55 Z" fill="${c2}"/>
      <ellipse cx="100" cy="40" rx="50" ry="16" fill="${c}"/>
      <rect x="72" y="95" width="56" height="60" rx="10" fill="#FFF9F2"/>
      <circle cx="100" cy="118" r="10" fill="${c2}"/>
      <path d="M85 140 L92 128 L100 136 L108 122 L115 140 Z" fill="${c2}"/>
    </svg>`;
  },
  treat: (accent) => {
    const c = accent === 'navy' ? '#0E1F35' : '#F4622E';
    const c2 = accent === 'navy' ? '#294061' : '#D94E1F';
    return `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M40 60 Q30 100 40 140 Q100 170 160 140 Q170 100 160 60 Q100 30 40 60 Z" fill="${c}"/>
      <path d="M40 60 Q100 30 160 60" stroke="${c2}" stroke-width="6" fill="none"/>
      <circle cx="75" cy="95" r="9" fill="#FFF9F2"/>
      <circle cx="125" cy="95" r="9" fill="#FFF9F2"/>
      <circle cx="100" cy="125" r="9" fill="#FFF9F2"/>
      <circle cx="70" cy="130" r="6" fill="#FFF9F2"/>
      <circle cx="130" cy="130" r="6" fill="#FFF9F2"/>
    </svg>`;
  },
  litter: (accent) => {
    const c = accent === 'navy' ? '#0E1F35' : '#F4622E';
    const c2 = accent === 'navy' ? '#294061' : '#D94E1F';
    return `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M45 55 H155 L145 175 H55 Z" fill="${c}"/>
      <path d="M45 55 L60 30 H140 L155 55 Z" fill="${c2}"/>
      <rect x="70" y="90" width="60" height="40" rx="8" fill="#FFF9F2"/>
      <circle cx="88" cy="110" r="4" fill="${c2}"/>
      <circle cx="100" cy="115" r="4" fill="${c2}"/>
      <circle cx="112" cy="108" r="4" fill="${c2}"/>
    </svg>`;
  },
  box: (accent) => {
    const c = accent === 'navy' ? '#0E1F35' : '#F4622E';
    const c2 = accent === 'navy' ? '#294061' : '#D94E1F';
    return `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="150" rx="70" ry="22" fill="${c2}"/>
      <path d="M35 90 L100 60 L165 90 L165 140 L100 170 L35 140 Z" fill="${c}"/>
      <path d="M35 90 L100 118 L165 90" stroke="#FFF9F2" stroke-width="5" fill="none"/>
      <path d="M100 118 L100 170" stroke="#FFF9F2" stroke-width="5"/>
    </svg>`;
  },
  brush: (accent) => {
    const c = accent === 'navy' ? '#0E1F35' : '#F4622E';
    const c2 = accent === 'navy' ? '#294061' : '#D94E1F';
    return `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="85" y="105" width="30" height="80" rx="14" fill="${c2}"/>
      <rect x="45" y="35" width="110" height="75" rx="26" fill="${c}"/>
      <g stroke="#FFF9F2" stroke-width="5" stroke-linecap="round">
        <line x1="65" y1="55" x2="65" y2="90"/>
        <line x1="85" y1="50" x2="85" y2="95"/>
        <line x1="105" y1="50" x2="105" y2="95"/>
        <line x1="125" y1="50" x2="125" y2="95"/>
        <line x1="140" y1="55" x2="140" y2="90"/>
      </g>
    </svg>`;
  },
  shampoo: (accent) => {
    const c = accent === 'navy' ? '#0E1F35' : '#F4622E';
    const c2 = accent === 'navy' ? '#294061' : '#D94E1F';
    return `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="60" y="30" width="30" height="20" rx="4" fill="${c2}"/>
      <path d="M55 50 H125 Q135 50 135 62 V175 Q135 185 125 185 H55 Q45 185 45 175 V62 Q45 50 55 50 Z" fill="${c}"/>
      <rect x="55" y="95" width="80" height="50" fill="#FFF9F2" opacity="0.9"/>
      <circle cx="150" cy="70" r="7" fill="${c}" opacity="0.5"/>
      <circle cx="162" cy="88" r="5" fill="${c}" opacity="0.4"/>
    </svg>`;
  },
  toy: (accent) => {
    const c = accent === 'navy' ? '#0E1F35' : '#F4622E';
    const c2 = accent === 'navy' ? '#294061' : '#D94E1F';
    return `<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="110" r="55" fill="${c}"/>
      <circle cx="75" cy="90" r="9" fill="${c2}"/>
      <circle cx="125" cy="90" r="9" fill="${c2}"/>
      <circle cx="100" cy="130" r="9" fill="${c2}"/>
      <circle cx="65" cy="130" r="7" fill="${c2}"/>
      <circle cx="135" cy="130" r="7" fill="${c2}"/>
      <path d="M70 45 Q60 25 45 30 Q50 48 65 55 Z" fill="${c}"/>
      <path d="M130 45 Q140 25 155 30 Q150 48 135 55 Z" fill="${c}"/>
    </svg>`;
  },
};

function getProductIcon(iconKey, accent) {
  const fn = ICONS[iconKey] || ICONS.food;
  return fn(accent || 'orange');
}
