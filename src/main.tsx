import React from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource-variable/nunito';
import '@fontsource-variable/pixelify-sans';
import App from './App';
import './style.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
