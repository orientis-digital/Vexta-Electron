import { useEffect, useState } from 'react'
import { CloseIcon, DownloadIcon } from './icons'
import { saveMediaToDownloads } from '../crypto/file_transfer'

export type LightboxItem = {
  url: string
  filename: string
  type: 'image' | 'video'
  blob?: Blob
}

type Props = {
  items: LightboxItem[]
  initialIndex?: number
  onClose: () => void
}

export function MediaLightbox({ items, initialIndex = 0, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  const current = items[currentIndex]

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') handleNext()
      else if (e.key === 'ArrowLeft') handlePrev()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, items.length])

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex((i) => i + 1)
      setZoom(1)
      setRotation(0)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1)
      setZoom(1)
      setRotation(0)
    }
  }

  const handleDownload = async () => {
    if (!current) return
    if (current.blob) {
      await saveMediaToDownloads(current.blob, current.filename)
    } else {
      try {
        const res = await fetch(current.url)
        const blob = await res.blob()
        await saveMediaToDownloads(blob, current.filename)
      } catch (err) {
        console.error('[Lightbox Download Error]', err)
      }
    }
  }

  if (!current) return null

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <span className="lightbox-filename">{current.filename}</span>
        <span className="lightbox-counter">
          {currentIndex + 1} / {items.length}
        </span>

        <div className="lightbox-actions">
          <button
            type="button"
            className="icon-btn"
            title="Zoom In"
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
          >
            🔍+
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Zoom Out"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          >
            🔍-
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Rotate 90°"
            onClick={() => setRotation((r) => (r + 90) % 360)}
          >
            🔄
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Save to Downloads/Vexta"
            onClick={handleDownload}
          >
            <DownloadIcon size={16} />
          </button>
          <button
            type="button"
            className="icon-btn danger-btn"
            title="Close Lightbox"
            onClick={onClose}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>

      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        {currentIndex > 0 && (
          <button
            type="button"
            className="lightbox-nav-btn prev-btn"
            onClick={handlePrev}
            title="Previous item"
          >
            ❮
          </button>
        )}

        <div
          className="lightbox-media-wrapper"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transition: 'transform 0.2s ease',
          }}
        >
          {current.type === 'video' ? (
            <video src={current.url} controls autoPlay className="lightbox-media" />
          ) : (
            <img src={current.url} alt={current.filename} className="lightbox-media" />
          )}
        </div>

        {currentIndex < items.length - 1 && (
          <button
            type="button"
            className="lightbox-nav-btn next-btn"
            onClick={handleNext}
            title="Next item"
          >
            ❯
          </button>
        )}
      </div>
    </div>
  )
}
