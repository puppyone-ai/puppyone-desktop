import { useEffect } from "react";

const ACTIVE_SCROLLBAR_CLASS = "po-scrollbar-active";
const MANAGED_SCROLLBAR_SELECTOR = '[data-po-scrollbar]:not([data-po-scrollbar="hidden"])';
const SCROLL_IDLE_DELAY_MS = 900;

function getScrollTarget(target: EventTarget | null): Element | null {
  if (
    target === window ||
    target === document ||
    target === document.documentElement ||
    target === document.body
  ) {
    return document.documentElement.matches(MANAGED_SCROLLBAR_SELECTOR)
      ? document.documentElement
      : null;
  }

  if (!(target instanceof Element)) return null;
  return target.matches(MANAGED_SCROLLBAR_SELECTOR) ? target : null;
}

export function ScrollbarActivity() {
  useEffect(() => {
    const timers = new Map<Element, number>();

    const markActive = (event: Event) => {
      const target = getScrollTarget(event.target);
      if (!target) return;
      target.classList.add(ACTIVE_SCROLLBAR_CLASS);

      const existingTimer = timers.get(target);
      if (existingTimer) window.clearTimeout(existingTimer);

      const nextTimer = window.setTimeout(() => {
        target.classList.remove(ACTIVE_SCROLLBAR_CLASS);
        timers.delete(target);
      }, SCROLL_IDLE_DELAY_MS);

      timers.set(target, nextTimer);
    };

    window.addEventListener("scroll", markActive, { capture: true, passive: true });

    return () => {
      window.removeEventListener("scroll", markActive, { capture: true });
      timers.forEach((timer, target) => {
        window.clearTimeout(timer);
        target.classList.remove(ACTIVE_SCROLLBAR_CLASS);
      });
      timers.clear();
    };
  }, []);

  return null;
}
