import React, { createContext, isValidElement, ReactNode, useContext, useLayoutEffect, useMemo } from 'react';
import { Behavior, StickToBottomOptions, useStickToBottom } from './useStickToBottom';

const StickToBottomContext = createContext<{
  scrollToBottom(behavior?: Behavior): Promise<boolean>;
  isAtBottom: boolean;
  escapedFromLock: boolean;
} | null>(null);

export interface StickToBottomProps extends React.HTMLAttributes<HTMLDivElement>, StickToBottomOptions {
  instance?: ReturnType<typeof useStickToBottom>;
  children: ReactNode;
}

export function StickToBottom({ instance, children, behavior, ...props }: StickToBottomProps) {
  const defaultInstance = useStickToBottom({ behavior });
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

  if (isValidElement(children)) {
    children = React.cloneElement(children, {
      ref: contentRef,
    } as React.HTMLAttributes<HTMLDivElement>);
  } else {
    children = <div ref={contentRef}>{children}</div>;
  }

  return (
    <StickToBottomContext.Provider value={context}>
      <div {...props} ref={scrollRef}>
        {children}
      </div>
    </StickToBottomContext.Provider>
  );
}

function useStickToBottomContext() {
  const context = useContext(StickToBottomContext);
  if (!context) {
    throw new Error('use-stick-to-bottom component hooks must be used within a StickToBottom component');
  }

  return context;
}

/**
 * Use this hook inside a <StickToBottom> component to programatically scroll to the bottom of the component.
 */
export const useScrollToBottom = () => useStickToBottomContext().scrollToBottom;

/**
 * Use this hook inside a <StickToBottom> component to gain access to whether the component is at the bottom of the scrollable area.
 */
export const useIsAtBottom = () => useStickToBottomContext().isAtBottom;

/**
 * Use this hook inside a <StickToBottom> component to know whether the user has escaped from the stickness lock.
 */
export const useEscapedFromLock = () => useStickToBottomContext().escapedFromLock;
