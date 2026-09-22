import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { GameProvider } from './game/GameProvider.jsx'
import './index.css'

// NOTE: React.StrictMode is intentionally omitted.
// StrictMode double-invokes effects in development, which would create and
// immediately destroy the PeerJS peer (and therefore the game code) twice.
ReactDOM.createRoot(document.getElementById('root')).render(
  <GameProvider>
    <App />
  </GameProvider>
)
