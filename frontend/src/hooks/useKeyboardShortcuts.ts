import { useEffect } from 'react';

interface KeyboardShortcutsOptions {
  onEnter?: () => void;
  onEscape?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  enabled?: boolean;
  preventDefault?: boolean;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions) {
  const {
    onEnter,
    onEscape,
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
    enabled = true,
    preventDefault = true,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contenteditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (event.key) {
        case 'Enter':
          if (onEnter) {
            if (preventDefault) event.preventDefault();
            onEnter();
          }
          break;
        case 'Escape':
        case 'Esc':
          if (onEscape) {
            if (preventDefault) event.preventDefault();
            onEscape();
          }
          break;
        case 'ArrowUp':
          if (onArrowUp) {
            if (preventDefault) event.preventDefault();
            onArrowUp();
          }
          break;
        case 'ArrowDown':
          if (onArrowDown) {
            if (preventDefault) event.preventDefault();
            onArrowDown();
          }
          break;
        case 'ArrowLeft':
          if (onArrowLeft) {
            if (preventDefault) event.preventDefault();
            onArrowLeft();
          }
          break;
        case 'ArrowRight':
          if (onArrowRight) {
            if (preventDefault) event.preventDefault();
            onArrowRight();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onEnter, onEscape, onArrowUp, onArrowDown, onArrowLeft, onArrowRight, enabled, preventDefault]);
}
