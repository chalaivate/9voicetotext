import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../shared/base.css';
import './settings.css';
import { applyCachedTheme } from '../shared/tokens';

applyCachedTheme();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
