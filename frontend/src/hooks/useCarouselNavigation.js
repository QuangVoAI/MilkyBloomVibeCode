import { useEffect, useRef, useState } from 'react';

export const useCarouselNavigation = () => {
  const [direction, setDirection] = useState(null);
  const [triggerSlide, setTriggerSlide] = useState(0);
  const isTransitioningRef = useRef(false);
  const transitionTimerRef = useRef(null);

  const releaseTransitionLock = () => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    isTransitioningRef.current = false;
  };

  const goToNext = () => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    setDirection('next');
    setTriggerSlide(prev => prev + 1);

    transitionTimerRef.current = setTimeout(releaseTransitionLock, 2000);
  };

  const goToPrev = () => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    setDirection('prev');
    setTriggerSlide(prev => prev + 1);

    transitionTimerRef.current = setTimeout(releaseTransitionLock, 2000);
  };

  useEffect(() => () => releaseTransitionLock(), []);

  return { direction, triggerSlide, goToNext, goToPrev };
};
