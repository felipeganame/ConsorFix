import type { SVGProps } from 'react';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'stroke' | 'fill'> {
  size?: number;
  stroke?: string;
  fill?: string;
  sw?: number;
}

function svg({ size = 16, stroke = 'currentColor', fill = 'none', sw = 1.8, ...rest }: IconProps, children: React.ReactNode) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </svg>
  );
}

export const Icons = {
  home: (p: IconProps) => svg(p, <><path d="M3 11l9-8 9 8"/><path d="M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10"/></>),
  inbox: (p: IconProps) => svg(p, <><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></>),
  list: (p: IconProps) => svg(p, <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></>),
  wrench: (p: IconProps) => svg(p, <path d="M14.7 6.3a4 4 0 11-5.4-5.4l3 3-2.8 2.8 3 3 2.2-3.4z"/>),
  people: (p: IconProps) => svg(p, <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>),
  wallet: (p: IconProps) => svg(p, <><path d="M20 12V8H6a2 2 0 010-4h12v4"/><path d="M4 6v12a2 2 0 002 2h14v-4"/><path d="M18 12a2 2 0 100 4h4v-4z"/></>),
  building: (p: IconProps) => svg(p, <><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="9" y2="6"/><line x1="15" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="9" y2="10"/><line x1="15" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="9" y2="14"/><line x1="15" y1="14" x2="15" y2="14"/><path d="M10 22v-4h4v4"/></>),
  user: (p: IconProps) => svg(p, <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>),
  chevDown: (p: IconProps) => svg(p, <polyline points="6 9 12 15 18 9"/>),
  chev: (p: IconProps) => svg(p, <polyline points="9 18 15 12 9 6"/>),
  search: (p: IconProps) => svg(p, <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>),
  spark: (p: IconProps) => svg(p, <><path d="M12 2l1.5 5L19 8.5l-5.5 1.5L12 15l-1.5-5L5 8.5 10.5 7z"/></>),
  filter: (p: IconProps) => svg(p, <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46"/>),
  plus: (p: IconProps) => svg(p, <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>),
  bell: (p: IconProps) => svg(p, <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>),
  more: (p: IconProps) => svg(p, <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>),
  check: (p: IconProps) => svg(p, <polyline points="20 6 9 17 4 12"/>),
  arrowLeft: (p: IconProps) => svg(p, <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>),
  whatsapp: (p: IconProps) => svg(p, <path d="M20.52 3.48A11.93 11.93 0 0012.04 0C5.45 0 .1 5.34.1 11.94c0 2.1.55 4.16 1.6 5.97L0 24l6.27-1.64a11.91 11.91 0 005.77 1.47h.01c6.6 0 11.94-5.34 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41z"/>),
  flag: (p: IconProps) => svg(p, <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></>),
  shield: (p: IconProps) => svg(p, <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>),
  clock: (p: IconProps) => svg(p, <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>),
  trash: (p: IconProps) => svg(p, <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></>),
};
