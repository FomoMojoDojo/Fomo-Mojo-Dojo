import { useNavigate } from 'react-router-dom';

interface Props {
  inputComplete: number;
  inputTotal: number;
  inputGaps: number;
  onDeepDive: (areaKey: string) => void;
  onInputsClick: () => void;
}

export default function BottomCards({ inputComplete, inputTotal, inputGaps, onDeepDive, onInputsClick }: Props) {
  const navigate = useNavigate();
  const cards = [
    {
      icon: '📋',
      title: 'Your Inputs',
      sub: inputTotal > 0
        ? `${inputComplete} of ${inputTotal} complete · ${inputGaps} gaps affecting your score`
        : 'No inputs yet — run AI Research to get started',
      onClick: () => navigate('/inputs'),
    },
    {
      icon: '🗺',
      title: 'Checkpoints Map',
      sub: inputTotal > 0
        ? 'View customer journey steps and gap analysis'
        : 'Customer journey mapping will appear after research',
      onClick: () => navigate('/job-steps'),
    },
    {
      icon: '⬡',
      title: 'Strategy Status',
      sub: inputTotal > 0
        ? 'Review strategic assumptions and validation status'
        : 'Strategy status will appear after research',
      onClick: () => navigate('/strategy'),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px] mt-[14px]">
      {cards.map((card) => (
        <button
          key={card.title}
          onClick={card.onClick}
          className="bg-ink border border-[#2a2618] rounded-[10px] p-[18px] px-5 flex items-center gap-[14px] cursor-pointer hover:bg-ink-2 transition-colors text-left group"
        >
          <div className="w-[38px] h-[38px] rounded-lg bg-[#2a2618] flex items-center justify-center text-[18px] shrink-0">
            {card.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-sans text-[14px] font-semibold text-t-dp leading-[1.3]">{card.title}</p>
            <p className="font-serif text-[13px] text-t-dt leading-[1.5] mt-[3px]">
              {card.sub}
            </p>
          </div>
          <span className="text-[12px] text-t-dm group-hover:text-t-dt transition-colors">→</span>
        </button>
      ))}
    </div>
  );
}
