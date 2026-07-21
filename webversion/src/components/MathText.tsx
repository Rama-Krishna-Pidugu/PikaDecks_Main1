import React, { useMemo } from 'react';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import DOMPurify, { type Config as DOMPurifyConfig } from 'dompurify';
import 'katex/dist/katex.min.css';

// ---------------------------------------------------------------------------
// Configure marked once (module level — shared across all renders)
// ---------------------------------------------------------------------------

// marked-katex-extension handles $...$ (inline) and $$...$$ (block) LaTeX.
// It must be applied before any other extensions so LaTeX is tokenised first.
marked.use(
  markedKatex({
    throwOnError: false,
    output: 'html',
  })
);

// Enable GitHub Flavored Markdown (tables, task lists, strikethrough, etc.)
marked.use({ gfm: true, breaks: true });

// ---------------------------------------------------------------------------
// DOMPurify config — allow KaTeX's generated HTML through the sanitiser
// ---------------------------------------------------------------------------
const DOMPURIFY_CONFIG: DOMPurifyConfig = {
  // Tags produced by KaTeX and standard GFM
  ADD_TAGS: ['math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'mfrac', 'msup', 'msub', 'msubsup', 'msqrt', 'mroot', 'mtext', 'mspace', 'mover', 'munder', 'munderover', 'mtable', 'mtr', 'mtd', 'mlabeledtr'],
  ADD_ATTR: [
    // KaTeX uses these
    'xmlns', 'encoding', 'display', 'aria-hidden', 'focusable',
    // Allow data-* broadly for checkbox state
    'data-checked',
    // Checked attribute for task-list inputs
    'checked', 'disabled', 'type',
  ],
  // Allow inline style (KaTeX injects styles)
  FORCE_BODY: false,
  ALLOW_ARIA_ATTR: true,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MathTextProps {
  text: string;
  /** Extra Tailwind/CSS classes on the wrapper */
  className?: string;
  /** When true the wrapper renders as a block <div>; otherwise inline <span> */
  block?: boolean;
}

export const MathText: React.FC<MathTextProps> = ({
  text,
  className = '',
  block = true,
}) => {
  const html = useMemo(() => {
    if (!text) return '';
    try {
      // marked-katex-extension's block rule requires $$...$$ to be its own
      // block-level element. When $$ appears inline inside a paragraph (e.g.
      // "Block:\n$$\n...\n$$"), marked's paragraph tokenizer consumes the $$
      // lines as paragraph text before the block-math rule can claim them.
      // Pre-processing: ensure opening and closing $$ delimiters are always
      // preceded/followed by a blank line so marked treats them as blocks.
      const normalized = text
        // opening $$  — add blank line before if the previous line is non-empty
        .replace(/([^\n])\n(\$\$[ \t]*\n)/g, '$1\n\n$2')
        // closing $$ — add blank line after if the next line is non-empty
        .replace(/([ \t]*\$\$)\n([^\n$])/g, '$1\n\n$2');

      const rawHtml = marked.parse(normalized) as string;
      return DOMPurify.sanitize(rawHtml, DOMPURIFY_CONFIG);
    } catch {
      // Absolute last resort — show plain text
      return text;
    }
  }, [text]);

  if (!html) return null;

  const Tag = block ? 'div' : 'span';

  return (
    <Tag
      className={`mathtext-prose ${className}`}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
