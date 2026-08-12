import { useEffect, useState } from "react";

// Phones and tablets: no hover, coarse pointer. This is the standard test for
// "there is no physical keyboard attached", which is what actually matters —
// a touch device can't type into the grid without the on-screen keyboard.
const QUERY = "(hover: none) and (pointer: coarse)";

export default function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setIsTouch(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isTouch;
}
