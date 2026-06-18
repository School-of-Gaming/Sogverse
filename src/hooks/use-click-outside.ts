import { useEffect, useRef, type RefObject } from "react";

/**
 * Calls `onClickOutside` when a mousedown event occurs outside the referenced element.
 */
export function useClickOutside(elementRef: RefObject<HTMLElement | null>, onClickOutside: () => void) {
  // Store callback in a ref so the event listener doesn't need to be
  // re-attached when callers pass an inline arrow function.
  const callbackRef = useRef(onClickOutside);
  useEffect(() => {
    callbackRef.current = onClickOutside;
  }, [onClickOutside]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      // A non-Node (or null) target can't be inside the element, so it counts
      // as an outside click — same result `contains(null)` used to give.
      const target = event.target;
      if (elementRef.current && !(target instanceof Node && elementRef.current.contains(target))) {
        callbackRef.current();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [elementRef]);
}
