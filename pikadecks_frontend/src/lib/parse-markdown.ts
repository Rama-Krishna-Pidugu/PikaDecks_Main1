export type MarkdownBlock =
  | { type: 'text'; content: string }
  | { type: 'image'; src: string; alt?: string };

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  if (!markdown) return [];

  const blocks: MarkdownBlock[] = [];
  // Regex to match images: ![alt](url)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(markdown)) !== null) {
    // Add preceding text if any
    if (match.index > lastIndex) {
      const text = markdown.substring(lastIndex, match.index).trim();
      if (text) {
        blocks.push({ type: 'text', content: text });
      }
    }

    // Add image block
    const alt = match[1];
    const src = match[2];
    blocks.push({ type: 'image', src, alt });

    lastIndex = imageRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < markdown.length) {
    const text = markdown.substring(lastIndex).trim();
    if (text) {
      blocks.push({ type: 'text', content: text });
    }
  }

  return blocks;
}
