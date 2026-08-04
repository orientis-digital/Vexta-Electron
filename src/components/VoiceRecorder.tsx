import { useEffect, useRef, useState } from 'react'
import { CheckIcon, TrashIcon } from './icons'

type Props = {
  onSend: (audioBlob: Blob) => void
  onCancel: () => void
}

export function VoiceRecorder({ onSend, onCancel }: Props) {
  const [seconds, setSeconds] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const animFrameRef = useRef<number | null>(null)

  useEffect(() => {
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let source: MediaStreamAudioSourceNode | null = null

    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream

        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorderRef.current = mediaRecorder
        audioChunksRef.current = []

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data)
          }
        }

        mediaRecorder.start(100)

        // Web Audio Analyser setup for canvas waveform rendering
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        audioCtx = new AudioContextClass()
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 64
        source = audioCtx.createMediaStreamSource(stream)
        source.connect(analyser)

        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        const drawWaveform = () => {
          const canvas = canvasRef.current
          if (!canvas) return
          const ctx = canvas.getContext('2d')
          if (!ctx) return

          analyser!.getByteFrequencyData(dataArray)

          ctx.clearRect(0, 0, canvas.width, canvas.height)

          const barWidth = 3
          const gap = 2
          const totalBars = Math.floor(canvas.width / (barWidth + gap))

          for (let i = 0; i < totalBars; i++) {
            const dataIndex = Math.floor((i / totalBars) * bufferLength)
            const val = dataArray[dataIndex] || 0
            const percent = val / 255
            const barHeight = Math.max(4, percent * (canvas.height - 4))

            const x = i * (barWidth + gap)
            const y = (canvas.height - barHeight) / 2

            ctx.fillStyle = '#39ff14'
            ctx.fillRect(x, y, barWidth, barHeight)
          }

          animFrameRef.current = requestAnimationFrame(drawWaveform)
        }

        drawWaveform()
      } catch (err) {
        console.error('[VoiceRecorder] Failed to access microphone:', err)
        onCancel()
      }
    }

    startRecording()

    const timerId = setInterval(() => {
      setSeconds((s) => s + 1)
    }, 1000)

    return () => {
      clearInterval(timerId)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (audioCtx) audioCtx.close()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [onCancel])

  const handleStopAndSend = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return

    recorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      onSend(audioBlob)
    }

    recorder.stop()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
    }
  }

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60)
    const s = sec % 60
    return `${mins}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="voice-recorder-bar">
      <button
        type="button"
        className="icon-btn danger-btn"
        title="Cancel recording"
        onClick={() => {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop())
          }
          onCancel()
        }}
      >
        <TrashIcon size={16} />
      </button>

      <div className="recording-status">
        <span className="recording-dot" />
        <span className="recording-time">{formatTime(seconds)}</span>
      </div>

      <canvas ref={canvasRef} width={140} height={28} className="waveform-canvas" />

      <button
        type="button"
        className="icon-btn send-btn"
        title="Send Voice Note"
        onClick={handleStopAndSend}
      >
        <CheckIcon size={16} />
      </button>
    </div>
  )
}
