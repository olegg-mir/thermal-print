import '@fontsource/noto-sans/latin-400.css';
import '@fontsource/noto-sans/latin-700.css';
import '@fontsource/noto-sans/cyrillic-400.css';
import '@fontsource/noto-sans/cyrillic-700.css';
import '@fontsource/noto-serif/latin-400.css';
import '@fontsource/noto-serif/latin-700.css';
import '@fontsource/noto-serif/cyrillic-400.css';
import '@fontsource/noto-serif/cyrillic-700.css';
import '@material/web/button/filled-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/button/filled-tonal-button.js';
import App from './App.svelte';
import './styles.css';
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });
mount(App, { target: document.getElementById('app')! });
