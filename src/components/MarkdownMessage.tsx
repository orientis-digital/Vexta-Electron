import { useState } from 'react'

type Props = {
  content: string
  className?: string
}

export function MarkdownMessage({ content, className = '' }: Props) {
  // Simple, safe parser for inline formatting & spoilers
  const renderFormattedText = (text: string) => {
    // Split by code blocks first
    const parts = text.split(/(```[\s\S]*?```)/g)

    return parts.map((part, pIdx) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const codeContent = part.slice(3, -3).replace(/^[a-z]+\n/i, '')
        return (
          <pre key={pIdx} className="markdown-code-block">
            <code>{codeContent}</code>
          </pre>
        )
      }

      // Process inline elements (Spoilers, Bold, Italics, Code)
      // We parse spoilers ||text|| first
      const inlineParts = part.split(/(\|\|[\s\S]*?\|\|)/g)

      return (
        <span key={pIdx}>
          {inlineParts.map((sub, sIdx) => {
            if (sub.startsWith('||') && sub.endsWith('||')) {
              const spoilerText = sub.slice(2, -2)
              return <SpoilerSpan key={sIdx} text={spoilerText} />
            }

            // Bold **text**
            const boldParts = sub.split(/(\*\*[\s\S]*?\*\*)/g)
            return boldParts.map((bChunk, bIdx) => {
              if (bChunk.startsWith('**') && bChunk.endsWith('**')) {
                return <strong key={bIdx}>{bChunk.slice(2, -2)}</strong>
              }

              // Italics *text*
              const italicParts = bChunk.split(/(\*[\s\S]*?\*)/g)
              return italicParts.map((iChunk, iIdx) => {
                if (iChunk.startsWith('*') && iChunk.endsWith('*')) {
                  return <em key={iIdx}>{iChunk.slice(1, -1)}</em>
                }

                // Inline code `text`
                const codeParts = iChunk.split(/(`[\s\S]*?`)/g)
                return codeParts.map((cChunk, cIdx) => {
                  if (cChunk.startsWith('`') && cChunk.endsWith('`')) {
                    return <code key={cIdx} className="markdown-inline-code">{cChunk.slice(1, -1)}</code>
                  }
                  return cChunk
                })
              })
            })
          })}
        </span>
      )
    })
  }

  return <div className={`markdown-message ${className}`}>{renderFormattedText(content)}</div>
}

function SpoilerSpan({ text }: { text: string }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <span
      className={`markdown-spoiler ${revealed ? 'revealed' : 'hidden'}`}
      onClick={(e) => {
        e.stopPropagation()
        setRevealed(!revealed)
      }}
      title={revealed ? 'Click to hide spoiler' : 'Click to reveal spoiler'}
    >
      {text}
    </span>
  )
}
