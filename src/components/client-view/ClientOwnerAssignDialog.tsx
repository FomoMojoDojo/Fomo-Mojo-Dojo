import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ClientOwnerAssignDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionTitle: string;
  ownerOptions: string[];
  currentOwner?: string | null;
  onAssign: (owner: string | null) => void;
  onAddUser: (name: string) => void;
};

export default function ClientOwnerAssignDialog({
  open,
  onOpenChange,
  actionTitle,
  ownerOptions,
  currentOwner,
  onAssign,
  onAddUser,
}: ClientOwnerAssignDialogProps) {
  const [selectedOwner, setSelectedOwner] = useState(currentOwner || "");
  const [newOwner, setNewOwner] = useState("");

  const sortedOptions = useMemo(
    () => [...ownerOptions].sort((a, b) => a.localeCompare(b)),
    [ownerOptions],
  );

  const addNewOwner = () => {
    const clean = newOwner.trim();
    if (!clean) return;
    onAddUser(clean);
    setSelectedOwner(clean);
    setNewOwner("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSelectedOwner(currentOwner || "");
          setNewOwner("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="font-sans text-[20px] font-semibold text-[#233c4b]">Assign owner</DialogTitle>
          <DialogDescription className="font-sans text-[14px] leading-[1.45] text-[#46606d]">
            One clear owner keeps momentum moving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-[#d8e1de] bg-white px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6e847f]">Action</p>
            <p className="mt-1 font-sans text-[15px] font-semibold text-[#233c4b]">{actionTitle}</p>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6e847f]">Choose owner</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sortedOptions.map((owner) => (
                <button
                  key={`owner-option-${owner}`}
                  type="button"
                  onClick={() => setSelectedOwner(owner)}
                  className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${
                    selectedOwner === owner
                      ? "border-[#233c4b] bg-[#233c4b] text-white"
                      : "border-[#d8e1de] bg-white text-[#46606d]"
                  }`}
                >
                  {owner}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6e847f]">Add person</p>
            <div className="mt-2 flex gap-2">
              <input
                value={newOwner}
                onChange={(event) => setNewOwner(event.target.value)}
                placeholder="Add new person"
                className="h-10 flex-1 rounded-lg border border-[#d8e1de] bg-white px-3 font-sans text-[14px] text-[#233c4b] outline-none focus:border-[#5f9b8c]"
              />
              <button
                type="button"
                onClick={addNewOwner}
                className="rounded-full border border-[#d8e1de] bg-white px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#46606d]"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full border border-[#d8e1de] bg-white px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#46606d]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onAssign(selectedOwner.trim() || null);
              onOpenChange(false);
            }}
            className="rounded-full bg-[#233c4b] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-white"
          >
            Assign owner
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
