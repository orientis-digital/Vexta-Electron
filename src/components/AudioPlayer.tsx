import { useEffect, useRef, useState } from 'react'

type Props = {
  src: string
  className?: string
}

export function AudioPlayer({ src, className = '' }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration)
      }
    }

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const onEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
    }
  }, [src])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !duration) return

    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, clickX / rect.width))
    const seekTime = percent * duration

    audio.currentTime = seekTime
    setCurrentTime(seekTime)
  }

  const formatTime = (sec: number) => {
    if (!sec || isNaN(sec)) return '0:00'
    const mins = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${mins}:${s.toString().padStart(2, '0')}`
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className={`audio-player-bubble ${className}`}>
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        type="button"
        className="audio-play-btn"
        onClick={togglePlay}
        title={isPlaying ? 'Pause voice note' : 'Play voice note'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <div className="audio-body">
        <div className="audio-waveform-track" onClick={handleSeek}>
          <div
            className="audio-waveform-progress"
            style={{ width: `${progressPercent}%` }}
          />
          <div className="audio-bars-pattern">
            {[40, 70, 30, 90, 60, 100, 50, 80, 45, 95, 30, 85, 60, 40, 75, 55, 90, 35, 65, 80].map(
              (h, idx) => (
                <span key={idx} style={{ height: `${h}%` }} />
              ),
            )}
          </div>
        </div>

        <div className="audio-meta">
          <span className="audio-time">{formatTime(currentTime)}</span>
          <span className="audio-duration">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}
