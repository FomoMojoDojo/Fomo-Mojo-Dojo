import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ClientNextMove } from "@/lib/clientViewModel";
import type { ClientMapSystemStatus } from "@/hooks/useClientMapInteractionState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ClientNextMoveCenterProps = {
  nextMove: ClientNextMove;
  supportText?: string;
  mapStatus: ClientMapSystemStatus;
  ownerOptions?: string[];
  onCommit?: (primaryOwner?: string | null) => void;
};

export default function ClientNextMoveCenter({
  nextMove,
  supportText,
  mapStatus,
  ownerOptions = [],
  onCommit,
}: ClientNextMoveCenterProps) {
  const [open, setOpen] = useState(false);
  const [primaryOwner, setPrimaryOwner] = useState("");
  const isCommitted = mapStatus !== "signal";

  const statusChip = useMemo(() => {
    if (mapStatus === "validated") return { label: "Validated", cls: "border-forest/35 bg-forest/15 text-forest" };
    if (mapStatus === "committed" || mapStatus === "in_progress") {
      return { label: "In Execution", cls: "border-forest/30 bg-forest/10 text-forest" };
    }
    return { label: "Signal", cls: "border-rust/35 bg-rust/10 text-rust" };
  }, [mapStatus]);

  const confirmCommit = () => {
    onCommit?.(primaryOwner.trim() || null);
    setOpen(false);
  };

  return (
    <>
    <section className="rounded-2xl bg-[#233c4b] px-5 py-5 text-white shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#b7d2d8]">Next move</p>
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] ${statusChip.cls}`}>
          {statusChip.label}
        </span>
      </div>
      <p className="mt-2 max-w-[700px] font-sans text-[24px] font-semibold leading-[1.25]">
        {nextMove.title}
      </p>
      {supportText ? (
        <p className="mt-2 max-w-[640px] font-sans text-[13px] leading-[1.45] text-[#d9e8ec]">
          {supportText}
        </p>
      ) : null}
      <div className="mt-4">
        {isCommitted ? (
          <span className="inline-flex rounded-full border border-white/35 bg-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.09em] text-white">
            In Progress
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex rounded-full border border-white/30 bg-white/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.09em] text-white transition-opacity hover:opacity-85"
          >
            Commit to this
          </button>
        )}
        <Link
          to={nextMove.linkTo || "/execution"}
          className="ml-2 inline-flex rounded-full border border-white/25 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#d8ebef] transition-opacity hover:opacity-80"
        >
          Open execution
        </Link>
      </div>
    </section>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-sans text-[22px] font-semibold text-[#233c4b]">Commit to this next move?</DialogTitle>
          <DialogDescription className="font-sans text-[14px] leading-[1.5] text-[#46606d]">
            Committing moves the map from signal to execution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-[#d8e1de] bg-white px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6e847f]">Selected next move</p>
            <p className="mt-1 font-sans text-[16px] font-semibold text-[#233c4b]">{nextMove.title}</p>
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6e847f]">Primary owner (optional)</label>
            <input
              list="client-next-owner-options"
              value={primaryOwner}
              onChange={(event) => setPrimaryOwner(event.target.value)}
              placeholder="Assign primary owner"
              className="mt-1 h-10 w-full rounded-lg border border-[#d8e1de] bg-white px-3 font-sans text-[14px] text-[#233c4b] outline-none focus:border-[#5f9b8c]"
            />
            <datalist id="client-next-owner-options">
              {ownerOptions.map((owner) => (
                <option key={`next-owner-${owner}`} value={owner} />
              ))}
            </datalist>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full border border-[#d8e1de] bg-white px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#46606d]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmCommit}
            className="rounded-full bg-[#233c4b] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-white"
          >
            Confirm commit
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
