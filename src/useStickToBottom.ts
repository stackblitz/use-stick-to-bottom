import {
  DependencyList,
  MutableRefObject,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefCallback,
} from 'react';

interface StickToBottomState {
  lastScrollTop?: number;
  resizeDifference: number;
  ignoreScrollToTop?: number;

  animation?: ReturnType<typeof requestAnimationFrame>;

  escapedFromLock: boolean;
  isAtBottom: boolean;

  resizeObserver?: ResizeObserver;
  listeners: Set<(isAtBottom: boolean) => void>;
}

export interface SpringBehavior {
  /**
   * A value from 0 to 1, on how much to damp the animation.
   * 0 means no damping, 1 means full damping.
   * @default 0.85
   */
  damping?: number;

  /**
   * The stiffness of how fast/slow the animation gets up to speed.
   * @default 0.1
   */
  stiffness?: number;

  /**
   * The inertial mass associated with the animation.
   * Higher numbers make the animation slower.
   * @default 2
   */
  mass?: number;
}

export type Behavior = ScrollBehavior | SpringBehavior;

export interface StickToBottomOptions {
  behavior?: ScrollBehavior;
}

export function useStickToBottom<ScrollRef extends HTMLElement, ContentRef extends HTMLElement>(
  options: StickToBottomOptions = {}
) {
  const [escapedFromLock, updateEscapedFromLock] = useState(false);
  const [isAtBottom, updateIsAtBottom] = useState(true);

  const state = useMemo<StickToBottomState>(
    () => ({
      escapedFromLock,
      isAtBottom,
      resizeDifference: 0,
      listeners: new Set(),
    }),
    []
  );

  const setIsAtBottom = useCallback((isAtBottom: boolean) => {
    state.isAtBottom = isAtBottom;
    updateIsAtBottom(isAtBottom);
  }, []);

  const setEscapedFromLock = useCallback((escapedFromLock: boolean) => {
    state.escapedFromLock = escapedFromLock;
    updateEscapedFromLock(escapedFromLock);
  }, []);

  const animate = useCallback((animate: () => void) => {
    if (state.animation) {
      cancelAnimationFrame(state.animation);
    }

    state.animation = requestAnimationFrame(animate);
  }, []);

  const scrollToBottom = useLatestCallback((behavior: Behavior = options.behavior ?? 'smooth') => {
    const scrollElement = scrollRef.current;

    if (!scrollElement) {
      throw new Error('Scroll to bottom called before scrollRef is set');
    }

    setIsAtBottom(true);

    const {
      stiffness = 0.1,
      damping = 0.85,
      mass = 2,
    } = {
      ...(options.behavior as SpringBehavior),
      ...(behavior as SpringBehavior),
    };

    let velocity = 0;

    const animateScroll = () => {
      if (!state.isAtBottom) {
        state.listeners.forEach((listener) => listener(false));
        return;
      }

      const targetScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;
      const { scrollTop } = scrollElement;
      const difference = targetScrollTop - scrollTop;

      if (behavior === 'instant') {
        scrollElement.scrollTop = targetScrollTop;
        state.ignoreScrollToTop = scrollElement.scrollTop;

        state.listeners.forEach((listener) => listener(true));

        return;
      }

      velocity = Math.max((damping * velocity + stiffness * difference) / mass, 0.5);

      scrollElement.scrollTop += velocity;
      state.ignoreScrollToTop = scrollElement.scrollTop;

      if (scrollTop === scrollElement.scrollTop) {
        state.listeners.forEach((listener) => listener(true));
        return;
      }

      animate(animateScroll);
    };

    animate(animateScroll);

    return new Promise<boolean>((resolve) => {
      state.listeners.add((isAtBottom) => {
        resolve(isAtBottom);
        state.listeners.delete(resolve);
      });
    });
  });

  const handleScroll = useCallback(() => {
    const offset = state.animation ? 100 : 50;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current!;
    let { lastScrollTop = scrollTop, ignoreScrollToTop } = state;

    state.lastScrollTop = scrollTop;
    state.ignoreScrollToTop = undefined;

    /**
     * Scroll events may come before a ResizeObserver event,
     * (see https://github.com/WICG/resize-observer/issues/25#issuecomment-248757228)
     * so in order to ignore resize event correctly wrap in a timeout.
     */
    setTimeout(() => {
      const { resizeDifference } = state;
      const scrollDifference = scrollTop - lastScrollTop;

      /**
       * When the resize event was negative, ignore it.
       * Also when the scroll difference is greater than or equal to the resize difference,
       * ignore the resize event. (resize events are normally a couple pixel smaller than the scroll difference)
       */
      if (resizeDifference && (resizeDifference < 0 || scrollDifference >= resizeDifference)) {
        ignoreScrollToTop = scrollTop;
      } else if (ignoreScrollToTop && ignoreScrollToTop > scrollTop) {
        /**
         * When the user scrolls up while the animation is playing
         * the scrollTop may not come in separate events. So if this happened
         * to make sure isScrollingUp is correct, set the lastScrollTop to the
         * ignored event.
         */
        lastScrollTop = ignoreScrollToTop;
      }

      const isScrollingDown = scrollTop > lastScrollTop;
      const isScrollingUp = scrollTop < lastScrollTop;
      const isNearBottom = scrollHeight - scrollTop - clientHeight <= offset;

      if (scrollTop === ignoreScrollToTop) {
        return;
      }

      if (!state.escapedFromLock && isScrollingUp) {
        setEscapedFromLock(true);
      } else if (state.escapedFromLock && isScrollingDown) {
        setEscapedFromLock(false);
      }

      setIsAtBottom(!state.escapedFromLock && isNearBottom);
    });
  }, []);

  const handleWheel = useCallback(({ deltaY }: WheelEvent) => {
    /**
     * The browser may cancel the scrolling from the mouse wheel,
     * if we update it from the animation in meantime.
     * So to prevent this, always escape when the wheel is scrolled up.
     */
    if (deltaY < 0) {
      setEscapedFromLock(true);
      setIsAtBottom(false);
    }
  }, []);

  const scrollRef = useRefCallback<ScrollRef>((scroll: ScrollRef | null) => {
    scrollRef.current?.removeEventListener('scroll', handleScroll);
    scrollRef.current?.removeEventListener('wheel', handleWheel);
    scrollRef.current = scroll;
    scroll?.addEventListener('scroll', handleScroll, { passive: true });
    scroll?.addEventListener('wheel', handleWheel);
  }, []);

  const contentRef = useRefCallback<ContentRef>((content: ContentRef | null) => {
    state.resizeObserver?.disconnect();

    if (!content) {
      return;
    }

    let previousHeight: number | undefined;

    state.resizeObserver = new ResizeObserver(([entry]) => {
      const { height } = entry.contentRect;
      const difference = height - (previousHeight ?? height);
      state.resizeDifference = difference;

      if (difference >= 0 && state.isAtBottom) {
        scrollToBottom();
      }

      previousHeight = height;

      /**
       * Reset the resize difference after the scroll event
       * has fired. Requires a rAF to wait for the scroll event,
       * and a setTimeout to wait for the other timeout we have in
       * setTimeout in case the scroll event happens after the resize event.
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
}

function useLatestCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback(((...args) => callbackRef.current(...args)) as T, []);
}

function useRefCallback<T>(callback: (ref: T) => void, deps: DependencyList) {
  const callbackRef = useCallback((ref: T) => {
    callbackRef.current = ref;
    callback(ref);
  }, deps) as any as RefCallback<T> & MutableRefObject<T | null>;

  return callbackRef;
}
