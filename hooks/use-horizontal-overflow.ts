"use client";
import { useEffect, useState } from "react";

export function useHorizontalOverflow() {
  const [element, ref] = useState<HTMLElement | null>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    if (!element) return;
    const measure = () => setOverflow(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, [element]);
  return { ref, overflow };
}
