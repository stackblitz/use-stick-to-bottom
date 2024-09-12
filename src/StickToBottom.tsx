import React, { createContext, ReactNode, RefCallback, useContext, useLayoutEffect, useMemo } from 'react';
import { Behavior, StickToBottomOptions, useStickToBottom } from './useStickToBottom';

const StickToBottomContext = createContext<{
  scrollToBottom(behavior?: Behavior): Promise<boolean>;
  isAtBottom: boolean;
  escapedFromLock: boolean;
} | null>(null);

export interface StickToBottomProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
    StickToBottomOptions {
  instance?: ReturnType<typeof useStickToBottom>;
  children: (contentRef: RefCallback<HTMLDivElement>) => ReactNode;
}

export function StickToBottom({
  instance,
  children,
  behavior,
  damping,
  stiffness,
  mass,
  ...props
}: StickToBottomProps) {
  const defaultInstance = useStickToBottom({
    behavior,
    damping,
    stiffness,
    mass,
  });
  const { scrollRef, contentRef, scrollToBottom, isAtBottom, escapedFromLock } = instance ?? defaultInstance;

  const context = useMemo(
    () => ({ scrollToBottom, isAtBottom, escapedFromLock }),
    [scrollToBottom, isAtBottom, escapedFromLock]
  );

  useLayoutEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    if (getComputedStyle(scrollRef.current).overflow === 'visible') {
      scrollRef.current.style.overflow = 'auto';
    }
  }, []);

  return (
    <StickToBottomContext.Provider value={context}>
      <div {...props} ref={scrollRef}>
        {children(contentRef)}
      </div>
    </StickToBottomContext.Provider>
  );
}

/**
 * Use this hook inside a <StickToBottom> component to gain access to whether the component is at the bottom of the scrollable area.
 */
export function useStickToBottomContext() {
  const context = useContext(StickToBottomContext);
  if (!context) {
    throw new Error('use-stick-to-bottom component hooks must be used within a StickToBottom component');
  }

  return context;
}
