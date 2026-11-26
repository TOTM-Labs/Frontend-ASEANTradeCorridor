// Animated sign-in background (ATC "rings" design, orange): two thick rings whose gradient turns slowly so a sheen
// travels round them, a dot orbiting a thin outer circle, and faint drifting specks. Pure CSS, no image files.
// Motion stops for people who ask their system to reduce motion.
import './LoginBackground.css';

const SPECKS = [
  [12, 18], [24, 72], [33, 30], [41, 84], [52, 12], [58, 62], [66, 36], [71, 88], [79, 54], [86, 74], [93, 40], [6, 52],
];

function Ring({ className }: { className: string }) {
  return (
    <div className={`atc-ring ${className}`}>
      <div className="atc-ring__glow" />
      <div className="atc-ring__orbit"><span className="atc-ring__dot" /></div>
      <div className="atc-ring__band" />
    </div>
  );
}

export function LoginBackground() {
  return (
    <div className="atc-bg" aria-hidden>
      <Ring className="atc-ring--tr" />
      <Ring className="atc-ring--bl" />
      {SPECKS.map(([x, y], i) => (
        <span key={i} className="atc-speck" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i % 6) * 0.9}s` }} />
      ))}
    </div>
  );
}
