import React from 'react';

/**
 * BotanicalLineArt
 *
 * Vintage natural-history-engraving style orchid line art used as
 * ghost watermarks, hero illustrations, section accents and card corners.
 *
 * Pure inline SVG so it is crisp at any size, themeable via `stroke`/`className`,
 * and never depends on a remote asset.
 *
 * Variants:
 *   "vampira"   — Dracula vampira (bat-eared, pendant) — hero default
 *   "ophrys"    — Ophrys apifera (bee orchid) — slender, alt hero
 *   "watermark" — extremely faint, decorative, used behind sections
 *   "corner"    — small leafy flourish for card corners
 */
export type LineArtVariant = 'vampira' | 'ophrys' | 'watermark' | 'corner';

interface Props {
  variant?: LineArtVariant;
  className?: string;
  stroke?: string;
  strokeWidth?: number;
  title?: string;
}

const BotanicalLineArt: React.FC<Props> = ({
  variant = 'vampira',
  className,
  stroke = '#1f3d2b',
  strokeWidth = 1.1,
  title,
}) => {
  const common = {
    fill: 'none',
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (variant === 'corner') {
    return (
      <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
        <g {...common}>
          <path d="M5,75 C20,65 25,50 22,32" />
          <path d="M22,32 C28,38 36,38 42,32" />
          <path d="M22,32 C18,24 18,16 24,10" />
          <path d="M24,10 C30,14 34,20 34,28" />
          <path d="M5,75 C18,72 30,64 38,52" />
        </g>
      </svg>
    );
  }

  if (variant === 'watermark') {
    return (
      <svg viewBox="0 0 600 600" className={className} aria-hidden="true">
        <g {...common} strokeWidth={strokeWidth * 0.85}>
          {/* Stylised inflorescence — stem and pendant orchids */}
          <path d="M300,40 C300,150 290,240 280,330" />
          <path d="M280,330 C260,420 240,500 210,560" />
          {/* Pendant blooms */}
          {[120, 200, 280, 360, 440].map((y, i) => {
            const x = 300 + Math.sin(i) * 60;
            return (
              <g key={i} transform={`translate(${x},${y})`}>
                <path d="M0,0 C-30,-20 -55,-5 -55,20 C-55,45 -25,55 0,40 C25,55 55,45 55,20 C55,-5 30,-20 0,0 Z" />
                <path d="M0,0 C-10,15 -10,35 0,55 C10,35 10,15 0,0 Z" />
                <path d="M-25,12 C-20,18 -10,18 -5,12" />
                <path d="M25,12 C20,18 10,18 5,12" />
              </g>
            );
          })}
          {/* Leaves at base */}
          <path d="M170,560 C200,540 240,540 280,560" />
          <path d="M330,560 C370,540 410,540 440,560" />
        </g>
      </svg>
    );
  }

  if (variant === 'ophrys') {
    return (
      <svg viewBox="0 0 360 540" className={className} aria-hidden="true">
        <title>{title ?? 'Ophrys apifera — botanical line illustration'}</title>
        <g {...common}>
          {/* Stem */}
          <path d="M180,510 C175,420 185,330 180,240 C175,160 185,90 180,30" />
          {/* Leaves */}
          <path d="M180,470 C140,455 110,430 95,395 C130,400 165,420 180,450" />
          <path d="M180,395 C220,380 248,355 262,320 C228,326 198,345 180,375" />
          {/* Three blooms ascending */}
          {[
            { cx: 180, cy: 80, s: 1.0 },
            { cx: 180, cy: 175, s: 0.85 },
            { cx: 180, cy: 260, s: 0.7 },
          ].map((b, i) => (
            <g key={i} transform={`translate(${b.cx},${b.cy}) scale(${b.s})`}>
              {/* Dorsal sepal */}
              <path d="M0,-40 C-12,-44 -18,-32 -14,-20 C-6,-12 6,-12 14,-20 C18,-32 12,-44 0,-40 Z" />
              {/* Petals */}
              <path d="M-26,-10 C-44,-4 -48,12 -36,22 C-22,20 -12,8 -14,-6 Z" />
              <path d="M26,-10 C44,-4 48,12 36,22 C22,20 12,8 14,-6 Z" />
              {/* Labellum (bee mimic) */}
              <path d="M-18,0 C-22,18 -10,38 0,40 C10,38 22,18 18,0 C10,-6 -10,-6 -18,0 Z" />
              <path d="M-8,8 C-6,18 6,18 8,8" />
              <path d="M-4,18 C-2,24 2,24 4,18" />
              {/* Column */}
              <path d="M-3,-30 L-3,-18 M3,-30 L3,-18" />
            </g>
          ))}
          {/* Bud at apex */}
          <path d="M180,30 C172,18 188,18 180,4" />
        </g>
      </svg>
    );
  }

  // default — "vampira"
  return (
    <svg viewBox="0 0 360 540" className={className} aria-hidden="true">
      <title>{title ?? 'Dracula vampira — botanical line illustration'}</title>
      <g {...common}>
        {/* Pendant inflorescence */}
        <path d="M180,20 C172,90 200,160 180,230 C160,300 200,360 180,440" />
        {/* Three foliose leaves */}
        <path d="M180,470 C130,455 90,420 70,365 C115,372 158,398 180,440" />
        <path d="M180,480 C228,470 268,442 290,395 C246,398 208,420 188,460" />
        <path d="M180,510 C155,498 130,478 115,448" />
        {/* Primary bloom — Dracula sepal "horns" */}
        <g transform="translate(180,250)">
          {/* Top sepal extended into long tail */}
          <path d="M0,-30 C-10,-60 -30,-110 -50,-160" />
          <path d="M0,-30 C10,-60 30,-110 50,-160" />
          {/* Bowl-shaped sepals */}
          <path d="M-50,-160 C-70,-130 -75,-90 -55,-50 C-30,-25 30,-25 55,-50 C75,-90 70,-130 50,-160" />
          {/* Lower sepal */}
          <path d="M-55,-50 C-30,-20 -10,0 0,20 C10,0 30,-20 55,-50" />
          {/* Lip / labellum suggested */}
          <path d="M-14,-30 C-8,-18 8,-18 14,-30" />
          <path d="M-10,-20 C-4,-12 4,-12 10,-20" />
          {/* Column dot */}
          <circle cx="0" cy="-32" r="1.6" fill={stroke} stroke="none" />
        </g>
        {/* Two pendant smaller buds */}
        <g transform="translate(180,360)">
          <path d="M0,0 C-14,-6 -22,8 -14,20 C-4,26 4,26 14,20 C22,8 14,-6 0,0 Z" />
          <path d="M-6,10 C-2,16 2,16 6,10" />
        </g>
        <g transform="translate(180,420)">
          <path d="M0,0 C-10,-4 -16,6 -10,14 C-2,18 2,18 10,14 C16,6 10,-4 0,0 Z" />
        </g>
      </g>
    </svg>
  );
};

export default BotanicalLineArt;
