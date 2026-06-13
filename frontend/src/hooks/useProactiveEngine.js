import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";

// A pleasant, gentle "pop" or "ting" sound in base64 to avoid external assets.
// This is a minimal WAV/MP3 that sounds like a UI bubble popping up.
const TING_SOUND_BASE64 = "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"; 

// Using a remote short pop sound from a stable CDN instead since a real valid MP3 base64 is too long.
const TING_SOUND_URL = "https://actions.google.com/sounds/v1/ui/pop.ogg";

export const useProactiveEngine = (isChatOpen, cartItemCount) => {
  const [proactiveMessage, setProactiveMessage] = useState(null);
  const location = useLocation();
  
  const prevItemCountRef = useRef(cartItemCount);
  const audioRef = useRef(null);
  const scrollYRef = useRef(window.scrollY);
  const scrollDeltaRef = useRef(0);
  const hasGreetedRef = useRef(false);
  const hasExitIntentRef = useRef(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    // Initialize audio
    audioRef.current = new Audio(TING_SOUND_URL);
    audioRef.current.volume = 0.5;
  }, []);

  const triggerMessage = useCallback((msg) => {
    if (isChatOpen) return; // Don't trigger if chat is already open
    setProactiveMessage(msg);
    // Play sound if not interacted yet? Browsers block audio without user interaction.
    // However, if they clicked around the site, it should be unblocked.
    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.log("Audio play blocked by browser:", e));
      }
    } catch (err) {}
  }, [isChatOpen]);

  // 1. Welcome Greeting (Immediately on first load)
  useEffect(() => {
    if (!hasGreetedRef.current && !isChatOpen) {
      hasGreetedRef.current = true;
      triggerMessage("Chào mừng bạn đến với MilkyBloom! Mình có thể giúp gì cho bạn không?");
    }
  }, [triggerMessage, isChatOpen]);

  // 2. Page Specific Idle Timers
  useEffect(() => {
    if (isChatOpen) {
      setProactiveMessage(null);
      return;
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (location.pathname.startsWith("/product/")) {
      timeoutRef.current = setTimeout(() => {
        triggerMessage("Sản phẩm này đang có giá tốt, bạn cần mình tư vấn thêm màu/size không?");
      }, 3000); // 3 seconds idle
    } else if (location.pathname === "/cart" || location.pathname === "/checkout") {
      timeoutRef.current = setTimeout(() => {
        triggerMessage("Bạn đang cân nhắc thanh toán? Cần hỗ trợ thì gọi mình nhé!");
      }, 2000); // 2 seconds idle
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [location.pathname, isChatOpen, triggerMessage]);

  // 3. Cart Item Added
  useEffect(() => {
    if (isChatOpen) return;
    const currentCount = cartItemCount || 0;
    if (currentCount > prevItemCountRef.current) {
      triggerMessage("Bạn vừa thêm sản phẩm vào giỏ! Chốt đơn luôn không nè?");
    }
    prevItemCountRef.current = currentCount;
  }, [cartItemCount, isChatOpen, triggerMessage]);

  // 4. Rage Scrolling (Lost user)
  useEffect(() => {
    if (isChatOpen) return;

    let scrollTimer;
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const delta = Math.abs(currentScrollY - scrollYRef.current);
      scrollDeltaRef.current += delta;
      scrollYRef.current = currentScrollY;

      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        // Evaluate scroll delta over a short period
        if (scrollDeltaRef.current > 3000) { // arbitrary threshold for "rage" scrolling
          triggerMessage("Có vẻ bạn đang tìm kiếm gì đó? Nói mình nghe, mình chỉ cho lẹ!");
        }
        scrollDeltaRef.current = 0; // reset
      }, 500);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, [isChatOpen, triggerMessage]);

  // 5. Exit Intent
  useEffect(() => {
    if (isChatOpen) return;

    const handleMouseLeave = (e) => {
      // If mouse leaves the top of the viewport
      if (e.clientY <= 0 && !hasExitIntentRef.current) {
        hasExitIntentRef.current = true;
        // Only give discount if they have items in cart, otherwise just ask them to stay
        if (cartItemCount > 0) {
          triggerMessage("Khoan đã! Giỏ hàng của bạn vẫn chưa thanh toán kìa. Mình tặng bạn mã giảm giá MILKY10 để chốt đơn luôn nha?");
        } else {
          triggerMessage("Khoan đã bạn ơi, bạn chưa tìm được sản phẩm ưng ý à? Để mình gợi ý cho nhé!");
        }
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, [isChatOpen, triggerMessage, cartItemCount]);

  // 6. Global Event Listener for Zero Results / Errors
  useEffect(() => {
    const handleProactiveEvent = (e) => {
      if (e.detail?.message) {
        triggerMessage(e.detail.message);
      }
    };
    window.addEventListener("proactive-ai-trigger", handleProactiveEvent);
    return () => window.removeEventListener("proactive-ai-trigger", handleProactiveEvent);
  }, [triggerMessage]);

  return { proactiveMessage, setProactiveMessage };
};
