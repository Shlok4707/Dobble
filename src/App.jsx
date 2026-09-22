import { useEffect, useState } from 'react'

import { useGame } from './game/GameProvider.jsx'
import { SCREEN } from './game/protocol.js'
import { preloadSymbols, validateAssets, REQUIRED_SYMBOLS } from './game/symbols.js'
import { isMuted, toggleMuted, unlockAudio } from './game/sound.js'

import LoadingScreen from './components/LoadingScreen.jsx'
import AssetError from './components/AssetError.jsx'
import HomePage from './pages/HomePage.jsx'
import CodeCreatedPage from './pages/CodeCreatedPage.jsx'
import JoinCodePage from './pages/JoinCodePage.jsx'
import GameStartTimerPage from './pages/GameStartTimerPage.jsx'
import GameBGPage from './pages/GameBGPage.jsx'
import WinnerPage from './pages/WinnerPage.jsx'
import LostPage from './pages/LostPage.jsx'
import DrawPage from './pages/DrawPage.jsx'

const SCREENS = {
  [SCREEN.HOME]: HomePage,
  [SCREEN.CODE_CREATED]: CodeCreatedPage,
  [SCREEN.JOIN_CODE]: JoinCodePage,
  [SCREEN.TIMER]: GameStartTimerPage,
  [SCREEN.GAME]: GameBGPage,
  [SCREEN.WINNER]: WinnerPage,
  [SCREEN.LOST]: LostPage,
  [SCREEN.DRAW]: DrawPage,
}

export default function App() {
  const { screen } = useGame()
  const [assets] = useState(() => validateAssets())
  const [progress, setProgress] = useState({ loaded: 0, total: REQUIRED_SYMBOLS })
  const [ready, setReady] = useState(false)
  const [muted, setMutedState] = useState(isMuted())

  useEffect(() => {
    if (!assets.valid) return
    let cancelled = false

    preloadSymbols((loaded, total) => {
      if (!cancelled) setProgress({ loaded, total })
    }).then(({ failed }) => {
      if (cancelled) return
      if (failed.length) console.warn('Symbols that failed to load:', failed)
      setReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [assets.valid])

  if (!assets.valid) {
    return <AssetError errors={assets.errors} count={assets.count} required={REQUIRED_SYMBOLS} />
  }

  if (!ready) {
    return <LoadingScreen loaded={progress.loaded} total={progress.total} />
  }

  const Screen = SCREENS[screen] || HomePage

  return (
    <>
      <Screen />

      <button
        type="button"
        onClick={() => {
          unlockAudio()
          setMutedState(toggleMuted())
        }}
        aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        title={muted ? 'Unmute' : 'Mute'}
        className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-xl
                   border-2 border-black/50 bg-space-700/80 text-lg text-white/80
                   backdrop-blur-sm transition hover:bg-space-600 hover:text-white"
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </>
  )
}
