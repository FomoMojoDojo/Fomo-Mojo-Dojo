import { useEffect, useRef } from 'react';
import { useSurfaceEducation } from '@/hooks/useSurfaceEducation';
import { resolveSurfaceSlots, type SlotData } from '@/lib/surfaceSlots';

interface SurfaceEducationPanelProps {
  surfaceKey: string;
  slotData?: SlotData;
  isAdmin: boolean;
  open: boolean;
  onClose: () => void;
  title?: string;
}

export default function SurfaceEducationPanel({
  surfaceKey,
  slotData = {},
  isAdmin,
  open,
  onClose,
  title = 'About this section',
}: SurfaceEducationPanelProps) {
  const { rows, loading } = useSurfaceEducation(surfaceKey, isAdmin);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <>
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 49,
            background: 'transparent',
          }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 400,
          zIndex: 50,
          background: '#fff',
          boxShadow: '-4px 0 24px rgba(17,17,17,0.10)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.22s cubic-bezier(0.22,1,0.36,1)',
          display: 'flex',
          flexDirection: 'column',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 20px 16px',
            borderBottom: '1px solid rgba(17,17,17,0.10)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              color: '#111',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              color: 'rgba(17,17,17,0.45)',
              lineHeight: 1,
              padding: '2px 4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          {loading && (
            <p
              style={{
                fontFamily: '"Inter", system-ui, sans-serif',
                fontSize: 13,
                color: 'rgba(17,17,17,0.45)',
              }}
            >
              Loading…
            </p>
          )}

          {!loading && rows.length === 0 && (
            <p
              style={{
                fontFamily: '"Inter", system-ui, sans-serif',
                fontSize: 13,
                color: 'rgba(17,17,17,0.45)',
              }}
            >
              No educational content published for this surface yet.
            </p>
          )}

          {!loading &&
            rows.map((row) => (
              <div key={row.id}>
                {row.section_a_template && (
                  <p
                    style={{
                      fontFamily: '"Inter", system-ui, sans-serif',
                      fontSize: 14,
                      color: '#111',
                      lineHeight: 1.6,
                      margin: '0 0 12px',
                    }}
                    data-section="a"
                  >
                    {resolveSurfaceSlots(row.section_a_template, slotData)}
                  </p>
                )}
                {row.section_b_content && (
                  <div
                    style={{
                      fontFamily: '"Inter", system-ui, sans-serif',
                      fontSize: 13,
                      color: 'rgba(17,17,17,0.65)',
                      lineHeight: 1.6,
                      margin: 0,
                      paddingTop: row.section_a_template ? 8 : 0,
                      borderTop: row.section_a_template
                        ? '1px solid rgba(17,17,17,0.08)'
                        : 'none',
                    }}
                    data-section="b"
                    // operator-controlled static HTML — no user input reaches this field
                    dangerouslySetInnerHTML={{ __html: row.section_b_content }}
                  />
                )}
                {row.audience === 'admin_only' && isAdmin && (
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: 8,
                      fontFamily: 'monospace',
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(17,17,17,0.35)',
                      border: '1px solid rgba(17,17,17,0.18)',
                      borderRadius: 3,
                      padding: '1px 5px',
                    }}
                  >
                    admin only
                  </span>
                )}
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
