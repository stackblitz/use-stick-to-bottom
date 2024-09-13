import React, { createContext, ReactNode, RefCallback, useContext, useLayoutEffect, useMemo } from 'react';
import { ScrollToBottom, StickToBottomOptions, useStickToBottom } from './useStickToBottom';

export interface StickToBottomContext {
  contentRef: RefCallback<HTMLDivElement>;
  scrollToBottom: ScrollToBottom;
  isAtBottom: boolean;
  escapedFromLock: boolean;
}

const StickToBottomContext = createContext<StickToBottomContext | null>(null);

export interface StickToBottomProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
    StickToBottomOptions {
  instance?: ReturnType<typeof useStickToBottom>;
  children: (context: StickToBottomContext) => ReactNode;
}

export function StickToBottom({
  instance,
  children,
  resizeBehavior,
  initialBehavior,
  mass,
  damping,
  stiffness,
  ...props
}: StickToBottomProps) {
  const defaultInstance = useStickToBottom({
    mass,
    damping,
    stiffness,
    resizeBehavior,
    initialBehavior,
  });
  const { scrollRef, contentRef, scrollToBottom, isAtBottom, escapedFromLock } = instance ?? defaultInstance;

  const context = useMemo<StickToBottomContext>(
    () => ({
      scrollToBottom,
      isAtBottom,
      escapedFromLock,
      contentRef,
    }),
    [scrollToBottom, isAtBottom, contentRef, escapedFromLock]
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
        {children(context)}
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
    throw new Error('use-stick-to-bottom component context must be used within a StickToBottom component');
  }

  return context;
}
