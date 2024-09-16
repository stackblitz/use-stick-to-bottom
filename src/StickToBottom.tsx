import React, { createContext, ReactNode, RefCallback, useContext, useLayoutEffect, useMemo } from 'react';
import { ScrollToBottom, StickToBottomOptions, useStickToBottom } from './useStickToBottom';

export interface StickToBottomContext {
  contentRef: RefCallback<HTMLDivElement>;
  scrollRef: RefCallback<HTMLDivElement>;
  scrollToBottom: ScrollToBottom;
  isAtBottom: boolean;
  isNearBottom: boolean;
  escapedFromLock: boolean;
}

const StickToBottomContext = createContext<StickToBottomContext | null>(null);

export interface StickToBottomProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
    StickToBottomOptions {
  instance?: ReturnType<typeof useStickToBottom>;
  children: ((context: StickToBottomContext) => ReactNode) | ReactNode;
}

export function StickToBottom({
  instance,
  children,
  resizeAnimation,
  initialAnimation,
  mass,
  damping,
  stiffness,
  ...props
}: StickToBottomProps) {
  const defaultInstance = useStickToBottom({
    mass,
    damping,
    stiffness,
    resizeAnimation,
    initialAnimation,
  });
  const { scrollRef, contentRef, scrollToBottom, isAtBottom, isNearBottom, escapedFromLock } =
    instance ?? defaultInstance;

  const context = useMemo<StickToBottomContext>(
    () => ({
      scrollToBottom,
      scrollRef,
      isAtBottom,
      isNearBottom,
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
      <div {...props}>{typeof children === 'function' ? children(context) : children}</div>
    </StickToBottomContext.Provider>
  );
}

export namespace StickToBottom {
  export interface ContentProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
    children: ((context: StickToBottomContext) => ReactNode) | ReactNode;
  }

  export function Content({ children, ...props }: ContentProps) {
    const context = useStickToBottomContext();

    return (
      <div
        ref={context.scrollRef}
        style={{
          height: '100%',
          width: '100%',
        }}
      >
        <div {...props} ref={context.contentRef}>
          {typeof children === 'function' ? children(context) : children}
        </div>
      </div>
    );
  }
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
