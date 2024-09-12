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
  scrollTop: number;
  lastScrollTop?: number;
  ignoreScrollToTop?: number;
  targetScrollTop: number;
  scrollDifference: number;
  resizeDifference: number;

  animation?: ReturnType<typeof requestAnimationFrame>;
  lastTick?: number;
  behavior?: Required<SpringBehavior>;
  velocity: number;
  accumulated: number;

  escapedFromLock: boolean;
  isAtBottom: boolean;
  isNearBottom: boolean;

  resizeObserver?: ResizeObserver;
  listeners: Set<VoidFunction>;
}

const DEFAULT_SPRING_BEHAVIOR = {
  /**
   * A value from 0 to 1, on how much to damp the animation.
   * 0 means no damping, 1 means full damping.
   *
   * @default 0.7
   */
  damping: 0.7,

  /**
   * The stiffness of how fast/slow the animation gets up to speed.
   *
   * @default 0.05
   */
  stiffness: 0.05,

  /**
   * The inertial mass associated with the animation.
   * Higher numbers make the animation slower.
   *
   * @default 1.25
   */
  mass: 1.25,
};

export interface SpringBehavior extends Partial<typeof DEFAULT_SPRING_BEHAVIOR> {}

export type Behavior = ScrollBehavior | SpringBehavior;

export interface StickToBottomOptions extends SpringBehavior {
  behavior?: ScrollBehavior;
}

const MIN_SCROLL_AMOUNT_PX = 0.5;
const STICK_TO_BOTTOM_OFFSET_PX = 100;
const SIXTY_FPS_INTERVAL_MS = 1000 / 60;

export const useStickToBottom = (options: StickToBottomOptions = {}) => {
  const [escapedFromLock, updateEscapedFromLock] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const updateIsAtBottom = useCallback((isAtBottom?: boolean) => {
    if (isAtBottom == null) {
      isAtBottom = state.escapedFromLock ? state.isNearBottom : state.isNearBottom || state.isAtBottom;
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
      resizeDifference: 0,
      accumulated: 0,
      velocity: 0,
      listeners: new Set(),

      get scrollTop() {
        return scrollRef.current?.scrollTop ?? 0;
      },
      set scrollTop(scrollTop: number) {
        if (scrollTop > state.targetScrollTop) {
          scrollTop = state.targetScrollTop;
        }

        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollTop;
          state.ignoreScrollToTop = scrollRef.current.scrollTop;
        }
      },

      get targetScrollTop() {
        if (!scrollRef.current) {
          return 0;
        }

        /**
         * When at very end of the container, scroll back up very slighty to
         * prevent the browser from auto-sticking the container to the bottom,
         * when a child element height resizes (doesn't happen for additions to DOM)
         * because the browser will try to adjust the scroll to compensate for this.
         * A slight offset off the bottom will prevent this, and allow for a smooth
         * animation instead of instant scrolling.
         */
        return scrollRef.current.scrollHeight - MIN_SCROLL_AMOUNT_PX - scrollRef.current.clientHeight;
      },
      get scrollDifference() {
        return this.targetScrollTop - this.scrollTop;
      },

      get isNearBottom() {
        return this.scrollDifference <= STICK_TO_BOTTOM_OFFSET_PX;
      },
    };
  }, []);

  const animate = useCallback((animate: VoidFunction) => {
    if (state.animation) {
      cancelAnimationFrame(state.animation);
    }

    state.animation = requestAnimationFrame(animate);
  }, []);

  const scrollToBottom = useLatestCallback(async (scrollBehavior: Behavior = options.behavior ?? 'smooth') => {
    updateIsAtBottom(true);

    const behavior = mergeBehaviors(options, state.behavior, scrollBehavior);
    state.behavior = behavior;

    const complete = () => {
      state.velocity = 0;
      state.accumulated = 0;
      state.listeners.forEach((resolve) => resolve());
      state.listeners.clear();

      /**
       * Reset the behavior after 500ms to allow for people
       * to call scrollToBottom in between a render, where the
       * animation may complete multiple times.
       */
      setTimeout(() => {
        if (behavior === state.behavior) {
          state.behavior = undefined;
        }
      }, 500);

      const { lastTick } = state;

      requestAnimationFrame(() => {
        if (lastTick === state.lastTick) {
          state.lastTick = undefined;
        }
      });
    };

    const animateScroll = () => {
      if (!state.isAtBottom || state.scrollTop >= state.targetScrollTop) {
        return complete();
      }

      if (scrollBehavior === 'instant') {
        state.scrollTop = state.targetScrollTop;

        return complete();
      }

      const tick = performance.now();
      const tickDelta = (tick - (state.lastTick ?? tick)) / SIXTY_FPS_INTERVAL_MS;

      state.velocity =
        (behavior.damping * state.velocity + behavior.stiffness * state.scrollDifference) / behavior.mass;
      state.accumulated += state.velocity * tickDelta;
      state.scrollTop += state.accumulated;
      state.lastTick = tick;

      if (state.accumulated >= MIN_SCROLL_AMOUNT_PX) {
        state.accumulated = 0;
      }

      return animate(animateScroll);
    };

    animate(animateScroll);

    await new Promise<void>((resolve) => state.listeners.add(resolve));

    return state.isAtBottom;
  });

  const handleScroll = useCallback(() => {
    const { scrollTop, ignoreScrollToTop, targetScrollTop } = state;
    let { lastScrollTop = scrollTop } = state;

    state.lastScrollTop = scrollTop;
    state.ignoreScrollToTop = undefined;

    if (ignoreScrollToTop && ignoreScrollToTop > scrollTop) {
      /**
       * When the user scrolls up while the animation plays, the `scrollTop` may
       * not come in separate events; if this happens, to make sure `isScrollingUp`
       * is correct, set the lastScrollTop to the ignored event.
       */
      lastScrollTop = ignoreScrollToTop;
    }

    /**
     * Scroll events may come before a ResizeObserver event,
     * so in order to ignore resize events correctly we use a
     * timeout.
     *
     * @see https://github.com/WICG/resize-observer/issues/25#issuecomment-248757228
     */
    setTimeout(() => {
      /**
       * When theres a resize difference ignore the resize event.
       */
      if (state.resizeDifference) {
        return;
      }

      /**
       * Offset the scrollTop by MINIMUM_SCROLL_AMOUNT_PX.
       * Make sure to never do this on a resize event.
       */
      if (scrollTop > targetScrollTop) {
        state.scrollTop = targetScrollTop;

        return;
      }

      if (scrollTop === ignoreScrollToTop) {
        return;
      }

      const isScrollingDown = scrollTop > lastScrollTop;
      const isScrollingUp = scrollTop < lastScrollTop;

      if (!state.escapedFromLock && isScrollingUp) {
        setEscapedFromLock(true);
      } else if (state.escapedFromLock && isScrollingDown) {
        setEscapedFromLock(false);
      }

      updateIsAtBottom();
    }, 1);
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

  const scrollRef = useRefCallback((scroll) => {
    scrollRef.current?.removeEventListener('scroll', handleScroll);
    scrollRef.current?.removeEventListener('wheel', handleWheel);
    scroll?.addEventListener('scroll', handleScroll, { passive: true });
    scroll?.addEventListener('wheel', handleWheel);
  }, []);

  const contentRef = useRefCallback((content) => {
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

      if (difference >= 0) {
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
        }, 1);
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

function useRefCallback<T extends (ref: HTMLDivElement | null) => any>(callback: T, deps: DependencyList) {
  const result = useCallback((ref: HTMLDivElement | null) => {
    result.current = ref;
    return callback(ref);
  }, deps) as any as MutableRefObject<HTMLDivElement | null> & RefCallback<HTMLDivElement>;

  return result;
}

function mergeBehaviors(...behaviors: (Behavior | undefined)[]) {
  const result = { ...DEFAULT_SPRING_BEHAVIOR };

  for (const behavior of behaviors) {
    if (typeof behavior !== 'object') {
      continue;
    }

    result.damping = behavior.damping ?? result.damping;
    result.stiffness = behavior.stiffness ?? result.stiffness;
    result.mass = behavior.mass ?? result.mass;
  }

  return result;
}
