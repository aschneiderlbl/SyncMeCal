/**
 * Cap'n Cal — the pirate-captain calendar mascot. Pure SVG, scales to any size.
 * Pass `size` to control the rendered width/height.
 */
export function CapnCal({ size = 140, headerColor = "#2563EB", month = "JUN" }: {
  size?: number;
  headerColor?: string;
  month?: string;
}) {
  return (
    <svg
      viewBox="0 0 160 160"
      width={size}
      height={size}
      aria-label="Cap'n Cal the pirate calendar mascot"
      className="animate-bob drop-shadow-[0_8px_14px_rgba(37,99,235,.18)]"
    >
      {/* Calendar body */}
      <rect x="28" y="48" width="104" height="96" rx="18" fill="#FFFFFF" stroke="#111827" strokeWidth="2"/>
      <rect x="28" y="48" width="104" height="22" rx="18" fill={headerColor}/>
      <rect x="28" y="62" width="104" height="8" fill={headerColor}/>
      <text x="80" y="64" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="700" fill="white">{month}</text>

      {/* Pirate tricorne hat */}
      <path d="M 12 48 Q 80 60 148 48 L 148 38 L 122 38 L 80 6 L 38 38 L 12 38 Z" fill="#0F172A"/>
      <path d="M 12 48 Q 80 60 148 48" stroke="#FCD34D" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M 38 38 L 80 6 L 122 38" stroke="#FCD34D" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>

      {/* Skull & crossbones */}
      <g transform="translate(80 22)">
        <line x1="-9" y1="5" x2="9" y2="-3" stroke="#F9FAFB" strokeWidth="2.2" strokeLinecap="round"/>
        <line x1="-9" y1="-3" x2="9" y2="5" stroke="#F9FAFB" strokeWidth="2.2" strokeLinecap="round"/>
        <circle cx="-9" cy="5" r="1.8" fill="#F9FAFB"/>
        <circle cx="9" cy="-3" r="1.8" fill="#F9FAFB"/>
        <circle cx="9" cy="5" r="1.8" fill="#F9FAFB"/>
        <circle cx="-9" cy="-3" r="1.8" fill="#F9FAFB"/>
        <ellipse cx="0" cy="-1" rx="4.5" ry="5" fill="#F9FAFB"/>
        <rect x="-2.5" y="2" width="5" height="3" rx="0.5" fill="#F9FAFB"/>
        <circle cx="-2" cy="-1" r="1" fill="#0F172A"/>
        <circle cx="2" cy="-1" r="1" fill="#0F172A"/>
      </g>

      {/* Eyebrow over good eye */}
      <path d="M 88 86 Q 98 80 108 86" stroke="#6B7280" strokeWidth="4" strokeLinecap="round" fill="none"/>

      {/* Eye-patch strap */}
      <path d="M 30 92 L 50 96 M 74 96 L 92 92" stroke="#0F172A" strokeWidth="2.5" fill="none" strokeLinecap="round"/>

      {/* Eye patch */}
      <ellipse cx="62" cy="100" rx="11" ry="9" fill="#0F172A"/>
      <ellipse cx="60" cy="97" rx="2" ry="1" fill="#374151"/>

      {/* Good eye */}
      <ellipse cx="98" cy="100" rx="7" ry="8" fill="#0F172A"/>
      <circle cx="100" cy="97" r="2.4" fill="#FFFFFF"/>

      {/* Mustache */}
      <path d="M 58 118 Q 70 124 80 120 Q 90 124 102 118" stroke="#9CA3AF" strokeWidth="4" fill="none" strokeLinecap="round"/>

      {/* Smile */}
      <path d="M 70 126 Q 80 130 90 126" stroke="#0F172A" strokeWidth="2.5" fill="none" strokeLinecap="round"/>

      {/* Beard */}
      <path d="M 52 124 Q 50 144 66 142 Q 80 148 94 142 Q 110 144 108 124 Q 100 130 80 130 Q 60 130 52 124 Z" fill="#D1D5DB" stroke="#9CA3AF" strokeWidth="1"/>
      <path d="M 62 138 Q 66 142 70 138" stroke="#9CA3AF" strokeWidth="1" fill="none"/>
      <path d="M 76 140 Q 80 144 84 140" stroke="#9CA3AF" strokeWidth="1" fill="none"/>
      <path d="M 90 138 Q 94 142 98 138" stroke="#9CA3AF" strokeWidth="1" fill="none"/>

      {/* Gold earring */}
      <circle cx="128" cy="108" r="4" fill="none" stroke="#FCD34D" strokeWidth="2.5"/>
    </svg>
  );
}
