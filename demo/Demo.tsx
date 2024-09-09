import { useEffect, useState } from 'react';
import { StickToBottom } from '../src/StickToBottom';

function Message({ children }: { children: string }) {
  // make this look like a message

  return <div className="bg-gray-100 rounded-lg p-4 shadow-md">{children}</div>;
}

export function Demo() {
  const [messages, setMessages] = useState<string[]>([...new Array(100)].map((a) => `${Math.random()}`));

  useEffect(() => {
    const timer = setInterval(() => {
      setMessages((messages) => [...messages, 'baz']);
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  return (
    <StickToBottom className="h-[50vh]">
      <div className="flex flex-col gap-4 p-6">
        {messages.map((message, i) => (
          <Message key={i}>{message}</Message>
        ))}
      </div>
    </StickToBottom>
  );
}
