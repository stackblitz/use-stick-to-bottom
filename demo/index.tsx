import './index.css';
import { createRoot } from 'react-dom/client';
import { Demo } from './Demo';

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<Demo />);
