import { useState } from 'react'

type Props = {
  content: string
  className?: string
}

export function MarkdownMessage({ content, className = '' }: Props) {
  const renderInline = (text: string) => {
    const inlineParts = text.split(/(\|\|[\s\S]*?\|\|)/g)
    return inlineParts.map((sub, sIdx) => {
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
    })
  }

  const renderFormattedLine = (line: string, key: number) => {
    const trimmed = line.trim()

    // Headings: # H1, ## H2, ### H3
    if (trimmed.startsWith('# ')) {
      return <h3 key={key} className="markdown-h1">{renderInline(trimmed.slice(2))}</h3>
    }
    if (trimmed.startsWith('## ')) {
      return <h4 key={key} className="markdown-h2">{renderInline(trimmed.slice(3))}</h4>
    }
    if (trimmed.startsWith('### ')) {
      return <h5 key={key} className="markdown-h3">{renderInline(trimmed.slice(4))}</h5>
    }

    // Horizontal Rule: --- or ***
    if (trimmed === '---' || trimmed === '***') {
      return <hr key={key} className="markdown-hr" />
    }

    // Bullet list items: * or -
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      return (
        <div key={key} className="markdown-bullet-item">
          <span className="markdown-bullet">•</span>
          <span>{renderInline(trimmed.slice(2))}</span>
        </div>
      )
    }

    // Normal paragraph line
    return <div key={key} className="markdown-line">{renderInline(line)}</div>
  }

  const renderContent = (raw: string) => {
    const blocks = raw.split(/(```[\s\S]*?```)/g)

    return blocks.map((block, bIdx) => {
      if (block.startsWith('```') && block.endsWith('```')) {
        const codeContent = block.slice(3, -3).replace(/^[a-z]+\n/i, '')
        return (
          <pre key={bIdx} className="markdown-code-block">
            <code>{codeContent}</code>
          </pre>
        )
      }

      const lines = block.split('\n')
      return (
        <div key={bIdx} className="markdown-block">
          {lines.map((line, lIdx) => renderFormattedLine(line, lIdx))}
        </div>
      )
    });
  }

  return <div className={`markdown-message ${className}`}>{renderContent(content)}</div>
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
