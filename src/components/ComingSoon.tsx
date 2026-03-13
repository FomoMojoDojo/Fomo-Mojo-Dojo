import { Link } from 'react-router-dom';

const VIEW_DESCRIPTIONS: Record<string, string> = {
  'job-steps': 'the eight steps your customers go through to get their job done — and where the biggest gaps are.',
  'strategy': 'your full strategy cascade — from winning aspiration to management systems and untested assumptions.',
  'opportunities': 'every customer outcome plotted by importance and satisfaction — your strategic goldmine.',
  'positioning': 'your competitive position, unique attributes, value proposition, and market category.',
  'analytics': 'your Mojo Score and input completion trends over time.',
  'routes': 'prioritized strategic routes organized by Fix, Improve, and Create — with impact scores and effort estimates.',
};

export default function ComingSoon({ viewKey }: { viewKey: string }) {
  const description = VIEW_DESCRIPTIONS[viewKey] || 'detailed strategic analysis for this area.';
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
      <div className="w-14 h-14 rounded-full bg-cream-mid border border-cream-dark flex items-center justify-center mb-5">
        <span className="text-2xl">🔒</span>
      </div>
      <h2 className="font-sans text-[22px] text-t-primary font-bold mb-2">This view isn't unlocked yet.</h2>
      <p className="font-sans text-[14px] text-t-secondary leading-[1.7] mb-1">
        Your strategist will unlock this view when your work together reaches this stage.
      </p>
      <p className="font-sans text-[14px] text-t-tertiary leading-[1.7] mb-6">
        It shows {description}
      </p>
      <Link
        to="/"
        className="font-mono text-[12px] uppercase tracking-[0.08em] text-gold hover:text-gold-dark transition-colors"
      >
        ← Back to Map View
      </Link>
    </div>
  );
}
