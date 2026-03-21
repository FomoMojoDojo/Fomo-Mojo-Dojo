type Props = {
  level: 0 | 1 | 2 | 3 | 4;
  color?: string;
  emptyColor?: string;
  size?: number;
  className?: string;
  title?: string;
};

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function quarterPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
) {
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, endDeg);
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y} Z`;
}

export default function AlignmentCircle({
  level,
  color = "#233C4B",
  emptyColor = "#ECEFED",
  size = 14,
  className = "",
  title,
}: Props) {
  const clamped = Math.max(0, Math.min(4, level)) as 0 | 1 | 2 | 3 | 4;
  const sizePx = Math.max(10, size);
  const vb = 24;
  const cx = 12;
  const cy = 12;
  const r = 10;
  const quarters: Array<[number, number]> = [
    [-90, 0],   // top-right
    [0, 90],    // bottom-right
    [90, 180],  // bottom-left
    [180, 270], // top-left
  ];

  return (
    <svg
      title={title}
      aria-label={title}
      className={className}
      width={sizePx}
      height={sizePx}
      viewBox={`0 0 ${vb} ${vb}`}
      role="img"
      style={{
        display: "inline-block",
      }}
    >
      <circle cx={cx} cy={cy} r={r} fill={emptyColor} />
      {quarters.map(([startDeg, endDeg], index) =>
        index < clamped ? (
          <path
            key={`${startDeg}-${endDeg}`}
            d={quarterPath(cx, cy, r, startDeg, endDeg)}
            fill={color}
          />
        ) : null,
      )}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(35,60,75,0.18)" strokeWidth="1" />
    </svg>
  );
}
