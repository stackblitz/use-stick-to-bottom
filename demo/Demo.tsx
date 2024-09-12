import { useState } from 'react';
import { StickToBottom } from '../src/StickToBottom';
import { useFakeMessages } from './useFakeMessages';
import Slider from '@mui/material/Slider';

function Message({ children }: { children: React.ReactNode }) {
  // make this look like a message

  return <div className="bg-gray-100 rounded-lg p-4 shadow-md">{children}</div>;
}

export function Demo() {
  const [speed, setSpeed] = useState(0.2);
  const messages = useFakeMessages(speed);

  return (
    <div className="prose">
      <Slider value={speed} onChange={(_, value) => setSpeed(value as number)} min={0} max={1} step={0.01}></Slider>

      <StickToBottom className="h-[50vh]">
        <div className="flex flex-col gap-4 p-6">
          {messages.map((message, i) => (
            <Message key={i}>{message}</Message>
          ))}
        </div>
      </StickToBottom>
    </div>
  );
}
