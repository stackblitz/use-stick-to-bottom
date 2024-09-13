import { useState } from 'react';
import { StickToBottom, useStickToBottomContext } from '../src/StickToBottom';
import { useFakeMessages } from './useFakeMessages';
import Slider from '@mui/material/Slider';

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <button
        className="sticky i-ph-arrow-circle-down-fill text-4xl rounded-lg left-[50%] translate-x-[-50%] bottom-0"
        onClick={() => scrollToBottom()}
      />
    )
  );
}

function Messages({ behavior, speed }: { behavior: ScrollBehavior; speed: number }) {
  const messages = useFakeMessages(speed);

  return (
    <div className="prose flex flex-col gap-2 h-[50vh] w-full">
      <h2 className="flex justify-center">{behavior}:</h2>

      <StickToBottom
        className="relative w-full"
        resizeBehavior={behavior}
        initialBehavior={behavior === 'instant' ? 'instant' : { mass: 10 }}
      >
        {({ contentRef }) => (
          <>
            <div className="flex flex-col gap-4 p-6" ref={contentRef}>
              {[...Array(10)].map((_, i) => (
                <Message key={i}>
                  <h1>This is a test</h1>
                  more testing text...
                </Message>
              ))}

              {messages.map((message, i) => (
                <Message key={i}>{message}</Message>
              ))}
            </div>

            <ScrollToBottom />
          </>
        )}
      </StickToBottom>
    </div>
  );
}

export function Demo() {
  const [speed, setSpeed] = useState(0.2);

  return (
    <>
      <Slider value={speed} onChange={(_, value) => setSpeed(value as number)} min={0} max={1} step={0.01}></Slider>

      <div className="flex gap-6 w-[100vw]">
        <Messages speed={speed} behavior="smooth" />
        <Messages speed={speed} behavior="instant" />
      </div>
    </>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <div className="bg-gray-100 rounded-lg p-4 shadow-md">{children}</div>;
}
