import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useOnClickOutside(ref: RefObject<HTMLElement | null>, handler: () => void): void {
  useEffect(() => {
    function listener(event: MouseEvent): void {
      const target = event.target as Node;
      if (!ref.current || ref.current.contains(target)) return;
      handler();
    }
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}
