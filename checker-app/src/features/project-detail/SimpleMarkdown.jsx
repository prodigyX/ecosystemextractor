/**
 * Renders `**bold**` spans within a line of plain text.
 * @param {string} line
 */
function renderInline(line) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

/**
 * Splits one markdown block into React elements. A block can contain a
 * heading glued directly to body text with no blank line between them
 * (seen in real extract data), so a leading `#` line is peeled off first
 * and the remaining lines are handled as their own list-or-paragraph.
 * @param {string[]} lines
 * @param {number} blockIndex
 */
function renderBlock(lines, blockIndex) {
  const elements = []
  let rest = lines

  const headingMatch = lines[0].match(/^(#{1,6})\s+(.*)/)
  if (headingMatch) {
    const level = Math.min(headingMatch[1].length + 3, 6) // map # -> h4..h6
    const Tag = `h${level}`
    elements.push(<Tag key={`${blockIndex}-h`}>{renderInline(headingMatch[2])}</Tag>)
    rest = lines.slice(1)
  }

  if (rest.length === 0) return elements

  if (rest.every((l) => l.startsWith('- '))) {
    elements.push(
      <ul key={`${blockIndex}-ul`}>
        {rest.map((l, j) => <li key={j}>{renderInline(l.slice(2))}</li>)}
      </ul>
    )
  } else {
    elements.push(<p key={`${blockIndex}-p`}>{renderInline(rest.join(' '))}</p>)
  }

  return elements
}

/**
 * Minimal markdown renderer for the ecosystem extract's `about_us` field —
 * covers exactly the subset those write-ups actually use (# headings,
 * `- ` bullet lists, `**bold**`, blank-line-separated paragraphs). Not a
 * general-purpose parser; intentionally small rather than pulling in a
 * markdown library for content this simple.
 * @param {{text: string}} props
 */
export function SimpleMarkdown({ text }) {
  const blocks = text.trim().split(/\n\s*\n/)

  return (
    <div className="simple-markdown">
      {blocks.flatMap((block, i) => {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
        return lines.length === 0 ? [] : renderBlock(lines, i)
      })}
    </div>
  )
}
