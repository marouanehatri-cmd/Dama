import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// Smoothly transition from initial preloader into app
const preloader = document.getElementById('app-preloader');
if (preloader) {
  setTimeout(() => {
    preloader.style.opacity = '0';
    preloader.style.visibility = 'hidden';
    setTimeout(() => preloader.remove(), 400);
  }, 450);
}
