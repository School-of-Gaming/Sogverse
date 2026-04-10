import { useEffect, useRef, type RefObject } from "react";

/**
 * Calls `onClickOutside` when a mousedown event occurs outside the referenced element.
 */
export function useClickOutside(elementRef: RefObject<HTMLElement | null>, onClickOutside: () => void) {
  // Store callback in a ref so the event listener doesn't need to be
  // re-attached when callers pass an inline arrow function.
  const callbackRef = useRef(onClickOutside);
  callbackRef.current = onClickOutside;

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (elementRef.current && !elementRef.current.contains(event.target as Node)) {
        callbackRef.current();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [elementRef]);
}
