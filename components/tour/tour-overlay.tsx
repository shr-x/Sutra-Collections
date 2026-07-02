'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import { useTour } from './tour-context';
import { TOUR_STEPS } from './tour-steps';

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 10;
const PW  = 340; // popover width
const PH_EST = 220; // estimated popover height

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(val, max));
}

function computePopoverStyle(rect: Rect | null, position: string): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobile = vw < 640;

  if (!rect || isMobile) {
    if (isMobile) {
      return { position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 10001 };
    }
    return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: PW, zIndex: 10001 };
  }

  const { top, left, width, height } = rect;

  switch (position) {
    case 'bottom': return {
      position: 'fixed',
      top: clamp(top + height + PAD, 8, vh - PH_EST - 8),
      left: clamp(left, 8, vw - PW - 8),
      width: PW, zIndex: 10001,
    };
    case 'top': return {
      position: 'fixed',
      top: clamp(top - PH_EST - PAD, 8, vh - PH_EST - 8),
      left: clamp(left, 8, vw - PW - 8),
      width: PW, zIndex: 10001,
    };
    case 'right': return {
      position: 'fixed',
      top: clamp(top, 8, vh - PH_EST - 8),
      left: clamp(left + width + PAD, 8, vw - PW - 8),
      width: PW, zIndex: 10001,
    };
    case 'left': return {
      position: 'fixed',
      top: clamp(top, 8, vh - PH_EST - 8),
      left: clamp(left - PW - PAD, 8, vw - PW - 8),
      width: PW, zIndex: 10001,
    };
    default: return {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)', width: PW, zIndex: 10001,
    };
  }
}

function getRect(selector: string): Rect | null {
  // Try each comma-separated selector in order, return first match
  const parts = selector.split(',').map((s) => s.trim());
  for (const sel of parts) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
        }
      }
    } catch { /* invalid selector */ }
  }
  return null;
}

export default function TourOverlay() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return <TourOverlayInner />;
}

function TourOverlayInner() {
  const { isActive, currentStep, totalSteps, nextStep, prevStep, skipTour, completeTour } = useTour();
  const router   = useRouter();
  const pathname = usePathname();

  const [spotRect, setSpotRect]       = useState<Rect | null>(null);
  const [elementFound, setElementFound] = useState(true);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  const step = TOUR_STEPS[currentStep];

  const measureAndSet = useCallback(() => {
    if (!step) return;
    const rect = getRect(step.target);
    if (rect) {
      setSpotRect(rect);
      setElementFound(true);
      // Scroll element into view
      const parts = step.target.split(',').map((s) => s.trim());
      for (const sel of parts) {
        try {
          const el = document.querySelector(sel);
          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); break; }
        } catch { /* ignore */ }
      }
      // Re-measure after scroll settles
      setTimeout(() => {
        const r2 = getRect(step.target);
        if (r2) setSpotRect(r2);
      }, 420);
    } else if (attemptsRef.current < 30) {
      attemptsRef.current++;
      timerRef.current = setTimeout(measureAndSet, 100);
    } else {
      setSpotRect(null);
      setElementFound(false);
    }
  }, [step]);

  // Handle navigation + element finding on step change
  useEffect(() => {
    if (!isActive || !step) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    attemptsRef.current = 0;
    setSpotRect(null);
    setElementFound(true);

    if (step.navigateTo && pathname !== step.navigateTo) {
      router.push(step.navigateTo);
      return; // wait for pathname to update, then re-run
    }

    timerRef.current = setTimeout(measureAndSet, 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isActive, currentStep, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recalculate on resize
  useEffect(() => {
    if (!isActive) return;
    const onResize = () => { const r = step ? getRect(step.target) : null; if (r) setSpotRect(r); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isActive, step]);

  if (!isActive || !step) return null;

  const isLast = currentStep === totalSteps - 1;
  const popoverStyle = computePopoverStyle(spotRect, step.position);

  const segCount = Math.min(totalSteps, 14);
  const segSize  = Math.ceil(totalSteps / segCount);
  const activeSeg = Math.floor(currentStep / segSize);

  return createPortal(
    <>
      {/* Spotlight div — box-shadow creates the dark overlay outside the element */}
      {spotRect ? (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top:    spotRect.top,
            left:   spotRect.left,
            width:  spotRect.width,
            height: spotRect.height,
            borderRadius: 8,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
            zIndex: 10000,
            pointerEvents: 'none',
            transition: 'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease',
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 10000, pointerEvents: 'none' }}
        />
      )}

      {/* Popover */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        style={popoverStyle}
        className="rounded-xl bg-white shadow-2xl ring-1 ring-black/10 overflow-hidden"
      >
        {/* Purple header */}
        <div className="flex items-center justify-between bg-purple-700 px-4 py-2.5">
          <span className="text-xs font-medium text-purple-200">Step {currentStep + 1} of {totalSteps}</span>
          <button
            onClick={skipTour}
            className="text-xs text-purple-300 hover:text-white transition-colors"
          >
            Skip Tour ✕
          </button>
        </div>

        <div className="p-4">
          <h3 className="mb-1.5 text-base font-bold text-gray-900">{step.title}</h3>
          <p className="text-sm leading-relaxed text-gray-600">{step.description}</p>

          {!elementFound && (
            <p className="mt-2 rounded bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
              Could not find this element on the page — click Next to continue.
            </p>
          )}
          {step.action && (
            <p className="mt-2 rounded bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700">
              💡 {step.action}
            </p>
          )}

          {/* Progress dots */}
          <div className="my-3 flex items-center justify-center gap-1">
            {Array.from({ length: segCount }).map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-200"
                style={{
                  width:  activeSeg === i ? 16 : 6,
                  height: 6,
                  background: activeSeg === i ? '#7C3AED' : '#E5E7EB',
                }}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <button
              onClick={prevStep}
              disabled={currentStep === 0}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
            >
              ← Back
            </button>

            {isLast || step.showFinishButton ? (
              <button
                onClick={completeTour}
                className="rounded-lg bg-purple-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-purple-800 transition-colors"
              >
                Finish Tour 🎉
              </button>
            ) : (
              <button
                onClick={nextStep}
                className="rounded-lg bg-purple-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-purple-800 transition-colors"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
