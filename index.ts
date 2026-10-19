import './global.css';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent registra o componente 'main' tanto no Expo Go quanto no build nativo.
registerRootComponent(App);
