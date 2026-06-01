import { useState, useEffect } from 'react';
import { useSurfaceTeachingMode } from '@/hooks/useSurfaceTeachingMode';
import SurfaceEducationPanel from './SurfaceEducationPanel';
import type { SlotData } from '@/lib/surfaceSlots';

interface SurfaceEducationTriggerProps {
  surfaceKey: string;
  slotData?: SlotData;
  isAdmin: boolean;
  panelTitle?: string;
}

export default function SurfaceEducationTrigger({
  surfaceKey,
  slotData = {},
  isAdmin,
  panelTitle,
}: SurfaceEducationTriggerProps) {
  const [open, setOpen] = useState(false);
  const { enabled: teachingMode } = useSurfaceTeachingMode();

  // Auto-open when teaching mode is enabled
  useEffect(() => {
    if (teachingMode) setOpen(true);
  }, [teachingMode]);

  return (
    <>
      <button
        type="button"
        data-surface-education-trigger={surfaceKey}
        onClick={() => setOpen((v) => !v)}
        title="About this section"
        aria-label="About this section"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: '1.5px solid rgba(17,17,17,0.22)',
          background: 'transparent',
          color: 'rgba(17,17,17,0.45)',
          fontFamily: 'serif',
          fontSize: 12,
          fontStyle: 'italic',
          fontWeight: 700,
          cursor: 'pointer',
          lineHeight: 1,
          flexShrink: 0,
          transition: 'border-color 0.12s, color 0.12s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#ff5b29';
          (e.currentTarget as HTMLButtonElement).style.color = '#ff5b29';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(17,17,17,0.22)';
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(17,17,17,0.45)';
        }}
      >
        i
      </button>
      <SurfaceEducationPanel
        surfaceKey={surfaceKey}
        slotData={slotData}
        isAdmin={isAdmin}
        open={open}
        onClose={() => setOpen(false)}
        title={panelTitle}
      />
    </>
  );
}
