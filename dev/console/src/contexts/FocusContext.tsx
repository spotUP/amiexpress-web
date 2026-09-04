import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Focus zones in the TUI
export type FocusZone = 'sidebar' | 'content' | 'footer' | 'header' | 'modal';

interface FocusContextValue {
  activeZone: FocusZone;
  setActiveZone: (zone: FocusZone) => void;
  focusableElements: Map<string, { zone: FocusZone; ref: React.RefObject<any> }>;
  registerElement: (id: string, zone: FocusZone, ref: React.RefObject<any>) => void;
  unregisterElement: (id: string) => void;
  focusNext: () => void;
  focusPrevious: () => void;
  focusZone: (zone: FocusZone) => void;
}

const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [activeZone, setActiveZone] = useState<FocusZone>('sidebar');
  const [focusableElements, setFocusableElements] = useState<Map<string, { zone: FocusZone; ref: React.RefObject<any> }>>(new Map());

  const registerElement = useCallback((id: string, zone: FocusZone, ref: React.RefObject<any>) => {
    setFocusableElements(prev => {
      const next = new Map(prev);
      next.set(id, { zone, ref });
      return next;
    });
  }, []);

  const unregisterElement = useCallback((id: string) => {
    setFocusableElements(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const focusZone = useCallback((zone: FocusZone) => {
    setActiveZone(zone);
    // Focus the first element in that zone
    const elementsInZone = Array.from(focusableElements.entries())
      .filter(([_, v]) => v.zone === zone)
      .sort((a, b) => a[0].localeCompare(b[0]));
    if (elementsInZone.length > 0) {
      elementsInZone[0][1].ref.current?.focus?.();
    }
  }, [focusableElements]);

  const focusNext = useCallback(() => {
    const zones: FocusZone[] = ['header', 'sidebar', 'content', 'footer'];
    const currentIndex = zones.indexOf(activeZone);
    const nextIndex = (currentIndex + 1) % zones.length;
    setActiveZone(zones[nextIndex]);
  }, [activeZone]);

  const focusPrevious = useCallback(() => {
    const zones: FocusZone[] = ['header', 'sidebar', 'content', 'footer'];
    const currentIndex = zones.indexOf(activeZone);
    const prevIndex = (currentIndex - 1 + zones.length) % zones.length;
    setActiveZone(zones[prevIndex]);
  }, [activeZone]);

  return (
    <FocusContext.Provider value={{
      activeZone,
      setActiveZone,
      focusableElements,
      registerElement,
      unregisterElement,
      focusNext,
      focusPrevious,
      focusZone,
    }}>
      {children}
    </FocusContext.Provider>
  );
}

export function useFocus() {
  const context = useContext(FocusContext);
  if (!context) {
    throw new Error('useFocus must be used within FocusProvider');
  }
  return context;
}

// Hook for inline editing
export function useInlineEdit<T>({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: T;
  onChange: (value: T) => void;
  onSave: (value: T) => void;
  onCancel: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<T>(value);

  const startEdit = () => {
    setEditValue(value);
    setIsEditing(true);
  };

  const commitEdit = () => {
    onSave(editValue);
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setEditValue(value);
    setIsEditing(false);
    onCancel();
  };

  const handleKey = (key: { return?: boolean; escape?: boolean }) => {
    if (key.return) commitEdit();
    if (key.escape) cancelEdit();
  };

  return {
    isEditing,
    editValue,
    setEditValue,
    startEdit,
    commitEdit,
    cancelEdit,
    handleKey,
  };
}

// Hook for focus-aware input - only handles input when zone is active
export function useFocusedInput(
  zone: FocusZone,
  handler: (input: string, key: any) => void
) {
  const { activeZone } = useFocus();
  const isFocused = activeZone === zone;

  // We use a ref to store the current handler so it's always up to date
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  const { useInput } = require('ink');
  
  useInput(React.useCallback((input: string, key: any) => {
    if (!isFocused) return;
    handlerRef.current(input, key);
  }, [isFocused]));
}