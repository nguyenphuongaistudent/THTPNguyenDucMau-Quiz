import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render';
import { cn, normalizeText } from '../lib/utils';

interface RichTextProps {
  content: string;
  className?: string;
}

const RichText: React.FC<RichTextProps> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      renderMathInElement(containerRef.current, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false,
      });
    }
  }, [content]);

  // Normalize text content while preserving HTML structure
  const normalizedContent = content
    .replace(/>([^<]+)</g, (match, text) => {
      return `>${normalizeText(text)}<`;
    })
    .replace(/^([^<]+)</, (match, text) => {
      return `${normalizeText(text)}<`;
    })
    .replace(/>([^<]+)$/, (match, text) => {
      return `>${normalizeText(text)}`;
    });

  return (
    <div
      ref={containerRef}
      className={cn("markdown-body", className)}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(normalizedContent) }}
    />
  );
};

export default RichText;
