import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefCallback } from 'react';

interface StickToBottomState {
  lastScrollTop?: number;
  resizeDifference: number;
  ignoreScrollToTop?: number;

  animation?: ReturnType<typeof requestAnimationFrame>;
  velocity: number;

  escapedFromLock: boolean;
  isAtBottom: boolean;
  isNearBottom: boolean;

  resizeObserver?: ResizeObserver;
  listeners: Set<VoidFunction>;
}

export interface SpringBehavior {
  damping?: number;
  stiffness?: number;
  mass?: number;
}

export type Behavior = ScrollBehavior | SpringBehavior;

export interface StickToBottomOptions {
  behavior?: ScrollBehavior;
}

const MIN_SCROLL_AMOUNT_PX = 0.5;
const STICK_TO_BOTTOM_OFFSET_PX = 100;

export const useStickToBottom = (options: StickToBottomOptions = {}) => {
  const [escapedFromLock, updateEscapedFromLock] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const updateIsAtBottom = useCallback((isAtBottom?: boolean) => {
    const scrollElement = scrollRef.current!;
    const scrollDifference = scrollElement.scrollHeight - scrollElement.clientHeight - scrollElement.scrollTop;
    state.isNearBottom = scrollDifference <= STICK_TO_BOTTOM_OFFSET_PX;

    if (isAtBottom == null) {
      isAtBottom = !state.escapedFromLock && state.isNearBottom;
    }

    state.isAtBottom = isAtBottom;
    setIsAtBottom(isAtBottom);
  }, []);

  const setEscapedFromLock = useCallback((escapedFromLock: boolean) => {
    state.escapedFromLock = escapedFromLock;
    updateEscapedFromLock(escapedFromLock);
  }, []);

  const state = useMemo<StickToBottomState>(() => {
    return {
      escapedFromLock,
      isAtBottom,
      isNearBottom: false,
      resizeDifference: 0,
      velocity: 0,
      listeners: new Set(),
    };
  }, []);

  const animate = useCallback((animate: VoidFunction) => {
    if (state.animation) {
      cancelAnimationFrame(state.animation);
    }

    state.animation = requestAnimationFrame(animate);
  }, []);

  const scrollToBottom = useLatestCallback(async (behavior = options.behavior ?? 'smooth') => {
    const scrollElement = scrollRef.current;

    if (!scrollElement) {
      throw new Error('Scroll to bottom called before scrollRef is set');
    }

    updateIsAtBottom(true);

    const { stiffness = 0.1, damping = 0.85, mass = 2 } = behavior as SpringBehavior;

    const complete = () => {
      state.velocity = 0;
      state.listeners.forEach((resolve) => resolve());
      state.listeners.clear();
    };

    const animateScroll = () => {
      if (!state.isAtBottom) {
        return complete();
      }

      const targetScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;

      const { scrollTop } = scrollElement;

      const difference = targetScrollTop > scrollTop ? targetScrollTop - scrollTop : 0;

      if (behavior === 'instant') {
        scrollElement.scrollTop = targetScrollTop;
        state.ignoreScrollToTop = scrollElement.scrollTop;

        return complete();
      }

      state.velocity = (damping * state.velocity + stiffness * difference) / mass;

      scrollElement.scrollTop += state.velocity;
      state.ignoreScrollToTop = scrollElement.scrollTop;

      if (scrollTop === scrollElement.scrollTop) {
        return complete();
      }

      return animate(animateScroll);
    };

    animate(animateScroll);

    await new Promise<void>((resolve) => state.listeners.add(resolve));

    return state.isAtBottom;
  });

  const handleScroll = useCallback(() => {
    const scrollElement = scrollRef.current!;
    const { scrollTop, scrollHeight, clientHeight } = scrollElement;
    let { lastScrollTop = scrollTop, ignoreScrollToTop } = state;

    state.lastScrollTop = scrollTop;
    state.ignoreScrollToTop = undefined;

    /**
     * Scroll events may come before a ResizeObserver event,
     * so in order to ignore resize events correctly we use a
     * timeout.
     *
     * @see https://github.com/WICG/resize-observer/issues/25#issuecomment-248757228
     */
    setTimeout(() => {
      const { resizeDifference } = state;

      if (resizeDifference) {
        /**
         * When theres a resize difference ignore the resize event.
         * For negative resize event's we'll update isAtBottom to true if they're
         * near the bottom again.
         */
        ignoreScrollToTop = scrollTop;
      } else if (ignoreScrollToTop && ignoreScrollToTop > scrollTop) {
        /**
         * When the user scrolls up while the animation plays, the `scrollTop` may
         * not come in separate events; if this happens, to make sure `isScrollingUp`
         * is correct, set the lastScrollTop to the ignored event.
         */
        lastScrollTop = ignoreScrollToTop;
      }

      const isScrollingDown = scrollTop > lastScrollTop;
      const isScrollingUp = scrollTop < lastScrollTop;
      const scrollDifference = scrollHeight - clientHeight - scrollTop;

      /**
       * If at the very end of the container, scroll back up very slighty to
       * prevent the browser from auto-sticking the container to the bottom,
       * when a child element height resizes (doesn't happen for additions to DOM)
       * because the browser will try to adjust the scroll to compensate for this.
       * A slight offset off the bottom will prevent this, and allow for a smooth
       * animation instead of instant scrolling.
       */
      if (scrollDifference === 0) {
        scrollElement.scrollTop = scrollTop - MIN_SCROLL_AMOUNT_PX;
        state.ignoreScrollToTop = scrollElement.scrollTop;

        return;
      }

      if (scrollTop === ignoreScrollToTop) {
        return;
      }

      if (!state.escapedFromLock && isScrollingUp) {
        setEscapedFromLock(true);
      } else if (state.escapedFromLock && isScrollingDown) {
        setEscapedFromLock(false);
      }

      updateIsAtBottom();
    });
  }, []);

  const handleWheel = useCallback(({ deltaY }: WheelEvent) => {
    /**
     * The browser may cancel the scrolling from the mouse wheel
     * if we update it from the animation in meantime.
     * To prevent this, always escape when the wheel is scrolled up.
     */
    if (deltaY < 0) {
      setEscapedFromLock(true);
      updateIsAtBottom();
    }
  }, []);

  const scrollRef: RefCallback<HTMLElement> & { current?: HTMLElement } = useCallback((scroll) => {
    scrollRef.current?.removeEventListener('scroll', handleScroll);
    scrollRef.current?.removeEventListener('wheel', handleWheel);
    scrollRef.current = scroll ?? undefined;
    scroll?.addEventListener('scroll', handleScroll, { passive: true });
    scroll?.addEventListener('wheel', handleWheel);
  }, []);

  const contentRef: RefCallback<HTMLElement> = useCallback((content) => {
    state.resizeObserver?.disconnect();

    if (!content) {
      return;
    }

    let previousHeight: number | undefined;

    state.resizeObserver = new ResizeObserver(([entry]) => {
      const { height } = entry.contentRect;
      const difference = height - (previousHeight ?? height);

      previousHeight = height;
      state.resizeDifference = difference;

      if (!state.isAtBottom) {
        updateIsAtBottom();
      }

      if (difference > 0) {
        /**
         * If it's a positive resize, scroll to the bottom when
         * we're already at the bottom.
         */
        if (state.isAtBottom) {
          scrollToBottom();
        }
      } else {
        /**
         * Else if it's a negative resize, check if we're near the bottom
         * if we are want to un-escape from the lock, because the resize
         * could have caused the container to be at the bottom.
         */
        if (state.isNearBottom) {
          setEscapedFromLock(false);
          updateIsAtBottom();
        }
      }

      /**
       * Reset the resize difference after the scroll event
       * has fired. Requires a rAF to wait for the scroll event,
       * and a setTimeout to wait for the other timeout we have in
       * resizeObserver in case the scroll event happens after the
       * resize event.
       */
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (state.resizeDifference === difference) {
            state.resizeDifference = 0;
          }
        });
      });
    });

    state.resizeObserver?.observe(content);
  }, []);

  return {
    contentRef,
    scrollRef,
    scrollToBottom,
    isAtBottom,
    escapedFromLock,
  };
};

function useLatestCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback(((...args) => callbackRef.current(...args)) as T, []);
}
