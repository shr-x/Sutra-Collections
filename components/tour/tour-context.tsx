'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { TOUR_STEPS } from './tour-steps';
import { markTourCompletedAction } from '@/app/(auth)/tour-actions';

const LS_STEP   = 'sutra_tour_step';
const LS_ACTIVE = 'sutra_tour_active';   // true = tour in flight (auto-resumes on page load)
const LS_PAUSED = 'sutra_tour_paused';  // true = user dismissed mid-tour, can resume
const LS_DONE   = 'sutra_tour_completed';

interface TourContextValue {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  startTour: (step?: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}

export function TourProvider({ children, role }: { children: ReactNode; role: string }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const isAdmin = role === 'admin';

  // Restore in-flight tour from localStorage on first render (client only)
  useEffect(() => {
    if (!isAdmin) return;
    try {
      const active = localStorage.getItem(LS_ACTIVE) === 'true';
      const step   = parseInt(localStorage.getItem(LS_STEP) ?? '0', 10);
      if (active && !isNaN(step) && step >= 0 && step < TOUR_STEPS.length) {
        setCurrentStep(step);
        setIsActive(true);
      }
    } catch { /* localStorage not available */ }
  }, [isAdmin]);

  const startTour = useCallback((step = 0) => {
    if (!isAdmin) return;
    setCurrentStep(step);
    setIsActive(true);
    try {
      localStorage.setItem(LS_ACTIVE, 'true');
      localStorage.setItem(LS_STEP, String(step));
      localStorage.removeItem(LS_PAUSED);
    } catch { /* ignore */ }
  }, [isAdmin]);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      const next = Math.min(prev + 1, TOUR_STEPS.length - 1);
      try {
        localStorage.setItem(LS_ACTIVE, 'true');
        localStorage.setItem(LS_STEP, String(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => {
      const next = Math.max(prev - 1, 0);
      try {
        localStorage.setItem(LS_ACTIVE, 'true');
        localStorage.setItem(LS_STEP, String(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Skip = dismiss without finishing — preserve step so user can resume later
  const skipTour = useCallback(() => {
    setIsActive(false);
    try {
      const step = parseInt(localStorage.getItem(LS_STEP) ?? '0', 10);
      localStorage.removeItem(LS_ACTIVE);
      // Keep LS_STEP so TourTrigger knows where to resume
      if (!isNaN(step) && step > 0) {
        localStorage.setItem(LS_PAUSED, 'true');
      } else {
        localStorage.removeItem(LS_PAUSED);
        localStorage.removeItem(LS_STEP);
      }
    } catch { /* ignore */ }
  }, []);

  // Complete = user finished the full tour
  const completeTour = useCallback(() => {
    setIsActive(false);
    try {
      localStorage.removeItem(LS_ACTIVE);
      localStorage.removeItem(LS_STEP);
      localStorage.removeItem(LS_PAUSED);
      localStorage.setItem(LS_DONE, 'true');
    } catch { /* ignore */ }
    // Persist to DB (non-blocking)
    markTourCompletedAction().catch(() => {});
  }, []);

  return (
    <TourContext.Provider value={{
      isActive: isActive && isAdmin,
      currentStep,
      totalSteps: TOUR_STEPS.length,
      startTour,
      nextStep,
      prevStep,
      skipTour,
      completeTour,
    }}>
      {children}
    </TourContext.Provider>
  );
}
