import { useEffect, useRef } from 'react';

export const useCarouselAutoplay = (interval = 5000) => {
  const autoPlayRef = useRef(null);

  const start = (callback) => {
    stop();
    autoPlayRef.current = setInterval(callback, interval);
  };

  const stop = () => {
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
  };

  const reset = (callback) => {
    start(callback);
  };

  useEffect(() => {
    return () => stop();
  }, []);

  return { start, stop, reset };
};
