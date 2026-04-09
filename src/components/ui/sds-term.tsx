import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type SdsTermProps = {
  short?: boolean;
  className?: string;
};

export default function SdsTerm({ short = true, className = "" }: SdsTermProps) {
  if (!short) {
    return <span className={className}>Strategic Decision System</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex cursor-help items-center border-b border-dotted border-current/40 ${className}`.trim()}
            aria-label="Strategic Decision System"
          >
            SDS
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] text-[12px]">
          Strategic Decision System
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
