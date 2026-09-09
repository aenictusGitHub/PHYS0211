import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import '../app/globals.css';
import { QuantumLab } from '../components/quantum-lab';

createRoot(document.getElementById('root')!).render(<QuantumLab />);
