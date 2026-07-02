'use client';

import { useState, useEffect } from 'react';
import { useTour } from './tour-context';

type ButtonMode = 'take' | 'resume';

export default function TourTrigger() {
  const { isActive, startTour } = useTour();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode]       = useState<ButtonMode>('take');
  const [resumeStep, setResumeStep] = useState(0);

  // Read tour state from localStorage — re-runs whenever isActive changes (e.g. after skip/complete)
  useEffect(() => {
    setMounted(true);
    try {
      const paused = localStorage.getItem('sutra_tour_paused') === 'true';
      const step   = parseInt(localStorage.getItem('sutra_tour_step') ?? '0', 10);
      if (!isActive && paused && !isNaN(step) && step > 0) {
        setMode('resume');
        setResumeStep(step);
      } else {
        setMode('take');
        setResumeStep(0);
      }
    } catch { /* ignore */ }
  }, [isActive]);

  // Hidden while tour overlay is showing
  if (!mounted || isActive) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {mode === 'resume' ? (
        <button
          onClick={() => startTour(resumeStep)}
          className="flex items-center gap-2 rounded-full bg-purple-700 px-4 py-3 text-sm font-semibold text-white shadow-xl hover:bg-purple-800 hover:scale-105 transition-all active:scale-95"
        >
          <span>↩</span>
          <span>Resume Tour (step {resumeStep + 1})</span>
        </button>
      ) : (
        <button
          onClick={() => startTour(0)}
          className="flex items-center gap-2 rounded-full bg-purple-700 px-4 py-3 text-sm font-semibold text-white shadow-xl hover:bg-purple-800 hover:scale-105 transition-all active:scale-95"
        >
          <span>🎯</span>
          <span>Take a Tour</span>
        </button>
      )}
    </div>
  );
}
