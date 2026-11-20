// Шрифт Inter — локально, без Google Fonts (приложение работает без интернета)
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/cyrillic-400.css';
import '@fontsource/inter/cyrillic-ext-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/cyrillic-500.css';
import '@fontsource/inter/cyrillic-ext-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/cyrillic-600.css';
import '@fontsource/inter/cyrillic-ext-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/cyrillic-700.css';
import '@fontsource/inter/cyrillic-ext-700.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './i18n';
import './index.css';
import { startNetworkMonitor } from './offline/network';

registerSW({ immediate: true });
startNetworkMonitor();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
