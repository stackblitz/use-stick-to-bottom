import {
  type DependencyList,
  type MutableRefObject,
  useCallback,
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
  behavior?: 'instant' | Required<SpringBehavior>;
  velocity: number;
  accumulated: number;

  escapedFromLock: boolean;
  isAtBottom: boolean;
  isNearBottom: boolean;

  resizeObserver?: ResizeObserver;
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
  resizeBehavior?: Behavior;
  initialBehavior?: Behavior;
}

export type ScrollToBottomOptions =
  | ScrollBehavior
  | {
      behavior?: Behavior;

      /**
       * Whether to wait for any existing scrolls to finish before
       * performing this one.
       *
       * @default false
       */
      wait?: boolean;

      /**
       * Only scroll to the bottom if we're already at the bottom.
       *
       * @default false
       */
      onlyIfAlready?: boolean;

      /**
       * The duration in ms that this scroll event should persist for.
       * Not to be confused with the duration of the animation -
       * for that you should adjust the behavior option.
       *
       * @default 350
       */
      duration?: number | Promise<void>;
    };

export type ScrollToBottom = (scrollOptions?: ScrollToBottomOptions) => Promise<boolean> | boolean;

const MIN_SCROLL_AMOUNT_PX = 0.5;
const STICK_TO_BOTTOM_OFFSET_PX = 150;
const SIXTY_FPS_INTERVAL_MS = 1000 / 60;
const RETAIN_BEHAVIOR_DURATION_MS = 350;

export const useStickToBottom = (options: StickToBottomOptions = {}) => {
  const [escapedFromLock, updateEscapedFromLock] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const optionsRef = useRef<StickToBottomOptions>(null!);
  optionsRef.current = options;

  const updateIsAtBottom = useCallback((isAtBottom: boolean) => {
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
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollTop;
          state.ignoreScrollToTop = scrollRef.current.scrollTop;
        }
      },

      get targetScrollTop() {
        if (!scrollRef.current) {
          return 0;
        }

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

  const scrollToBottom = useCallback<ScrollToBottom>((scrollOptions = {}) => {
    if (typeof scrollOptions === 'string') {
      scrollOptions = { behavior: scrollOptions };
    }

    if (scrollOptions.onlyIfAlready && !state.isAtBottom) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      updateIsAtBottom(true);

      let durationElapsed = false;

      const tick = () => {
        state.animation = undefined;

        if (!state.isAtBottom) {
          return next('end');
        }

        if (state.scrollTop >= state.targetScrollTop) {
          return next('continue');
        }

        if (behavior === 'instant') {
          state.scrollTop = state.targetScrollTop;

          return next('continue');
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

        return next('continue');
      };

      const next = (step: 'end' | 'continue' | 'queue' | 'restart') => {
        if (step === 'continue') {
          const atStartTarget = state.scrollTop >= Math.min(startTarget, state.targetScrollTop);

          if (!durationElapsed) {
            startTarget = state.targetScrollTop;
            return next('queue');
          }

          if (!atStartTarget) {
            return next('queue');
          }

          next('end');

          /**
           * If we're still below the target, then queue
           * up another scroll to the bottom with the last
           * requested behavior.
           */
          if (state.scrollTop < state.targetScrollTop) {
            scrollToBottom({
              behavior: mergeBehaviors(optionsRef.current, optionsRef.current.resizeBehavior),
              wait: true,
            });
          }

          return null;
        }

        if (step !== 'queue') {
          if (state.animation) {
            cancelAnimationFrame(state.animation);
            state.animation = undefined;
          }

          state.accumulated = 0;
          state.behavior = undefined;
        }

        if (step === 'end') {
          resolve(state.isAtBottom);
        } else {
          state.animation ||= requestAnimationFrame(tick);
        }

        if (step !== 'restart') {
          const { lastTick } = state;

          requestAnimationFrame(() => {
            if (lastTick === state.lastTick) {
              state.lastTick = undefined;
              state.velocity = 0;
            }
          });
        }

        return null;
      };

      // IMPORTANT: next should be called before reading state
      next(scrollOptions.wait ? 'queue' : 'restart');

      let startTarget = state.targetScrollTop;
      const behavior = mergeBehaviors(optionsRef.current, state.behavior, scrollOptions.behavior);
      state.behavior = behavior;

      if (scrollOptions.duration instanceof Promise) {
        scrollOptions.duration.finally(() => {
          durationElapsed = true;
        });
      } else {
        setTimeout(() => {
          durationElapsed = true;
        }, scrollOptions.duration ?? RETAIN_BEHAVIOR_DURATION_MS);
      }
    });
  }, []);

  const handleScroll = useCallback(({ target }: Event) => {
    if (target !== scrollRef.current) {
      return;
    }

    const { scrollTop, ignoreScrollToTop } = state;
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
      if (state.resizeDifference || scrollTop === ignoreScrollToTop) {
        return;
      }

      const isScrollingDown = scrollTop > lastScrollTop;
      const isScrollingUp = scrollTop < lastScrollTop;

      if (!state.escapedFromLock && isScrollingUp) {
        setEscapedFromLock(true);
      } else if (state.escapedFromLock && isScrollingDown) {
        setEscapedFromLock(false);
      }

      updateIsAtBottom(!state.escapedFromLock && state.isNearBottom);
    }, 1);
  }, []);

  const handleWheel = useCallback(({ target, deltaY }: WheelEvent) => {
    /**
     * The browser may cancel the scrolling from the mouse wheel
     * if we update it from the animation in meantime.
     * To prevent this, always escape when the wheel is scrolled up.
     */
    if (target === scrollRef.current && deltaY < 0) {
      setEscapedFromLock(true);
      updateIsAtBottom(false);
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

      state.resizeDifference = difference;

      /**
       * Sometimes the browser can overscroll past the target,
       * so check for this and adjust appropriately.
       */
      if (state.scrollTop > state.targetScrollTop) {
        state.scrollTop = state.targetScrollTop;
      }

      if (difference >= 0) {
        /**
         * If it's a positive resize, scroll to the bottom when
         * we're already at the bottom.
         */
        const behavior = mergeBehaviors(
          optionsRef.current,
          previousHeight ? optionsRef.current.resizeBehavior : optionsRef.current.initialBehavior
        );

        scrollToBottom({ behavior, wait: true, onlyIfAlready: true });
      } else {
        /**
         * Else if it's a negative resize, check if we're near the bottom
         * if we are want to un-escape from the lock, because the resize
         * could have caused the container to be at the bottom.
         */
        if (state.isNearBottom) {
          setEscapedFromLock(false);
          updateIsAtBottom(true);
        }
      }

      previousHeight = height;

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

function useRefCallback<T extends (ref: HTMLDivElement | null) => any>(callback: T, deps: DependencyList) {
  const result = useCallback((ref: HTMLDivElement | null) => {
    result.current = ref;
    return callback(ref);
  }, deps) as any as MutableRefObject<HTMLDivElement | null> & RefCallback<HTMLDivElement>;

  return result;
}

function mergeBehaviors(...behaviors: (Behavior | undefined)[]) {
  const result = { ...DEFAULT_SPRING_BEHAVIOR };
  let instant = false;

  for (const behavior of behaviors) {
    if (behavior === 'instant') {
      instant = true;
      continue;
    }

    instant = false;

    if (typeof behavior !== 'object') {
      continue;
    }

    result.damping = behavior.damping ?? result.damping;
    result.stiffness = behavior.stiffness ?? result.stiffness;
    result.mass = behavior.mass ?? result.mass;
  }

  return instant ? 'instant' : result;
}
