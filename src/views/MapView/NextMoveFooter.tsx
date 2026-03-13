import { Link } from 'react-router-dom';
import type { ClientSummary } from '@/lib/types';

interface Props {
  summary: ClientSummary;
}

export default function NextMoveFooter({ summary }: Props) {
  return (
    <div className="bg-ink rounded-[10px] p-4 sm:p-[18px] sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="max-w-full sm:max-w-[480px]">
        <span className="font-mono text-[10px] text-gold uppercase tracking-[0.1em]">
          YOUR NEXT MOVE
        </span>
        <p className="font-serif text-[14px] italic text-t-ds leading-[1.65] mt-[6px]">
          {summary.next_move}
        </p>
      </div>
      <Link to="/routes" className="shrink-0 ml-4 px-5 py-[10px] rounded-md border border-[#3a3020] bg-transparent text-gold-light font-mono text-[11px] uppercase tracking-[0.08em] hover:border-[#6a6030] transition-colors">
        Open Playbook →
      </Link>
    </div>
  );
}
