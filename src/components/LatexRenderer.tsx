// components/LatexRenderer.tsx - Renamed from MathJaxRenderer.tsx and updated to use KaTeX
"use client";

import React, { useEffect, useRef } from 'react';

interface LatexRendererProps {
  content: string;
  className?: string;
}

const LatexRenderer: React.FC<LatexRendererProps> = ({ content, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load KaTeX stylesheets if not already loaded
    if (!document.getElementById('katex-css')) {
      const link = document.createElement('link');
      link.id = 'katex-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css';
      link.integrity = 'sha384-zh0CIsZ2XoyZ4Xf7FdQKCBEi3LB+YIYF9dK3Q9BiGMhVEt5OEZiYYL+2gErKw8t3';
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }

    // Load KaTeX script if not already loaded
    const loadKatex = async () => {
      if (typeof window.katex === 'undefined') {
        // Load main KaTeX script
        const katexScript = document.createElement('script');
        katexScript.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js';
        katexScript.integrity = 'sha384-Rma6DA2IPUwhNxmrB2QMsL1Nn7wJy1CSNJ3ClkdCr9LaBqChgJQOt2HiSiAn6yKo';
        katexScript.crossOrigin = 'anonymous';
        document.head.appendChild(katexScript);
        
        // Wait for KaTeX to load
        await new Promise<void>((resolve) => {
          katexScript.onload = () => resolve();
        });
        
        // Load the auto-render extension
        const autoRenderScript = document.createElement('script');
        autoRenderScript.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/auto-render.min.js';
        autoRenderScript.integrity = 'sha384-+XBljXPPiv+OzfbB3cVmLHf4hdUFHlWNZN5spNQ7rmHTXpd7WvJum6fIACpNNfIR';
        autoRenderScript.crossOrigin = 'anonymous';
        document.head.appendChild(autoRenderScript);
        
        // Wait for auto-render to load
        await new Promise<void>((resolve) => {
          autoRenderScript.onload = () => resolve();
        });
      }
      
      // Render math expressions once KaTeX is loaded
      renderMath();
    };
    
    const renderMath = () => {
      if (containerRef.current && window.renderMathInElement) {
        window.renderMathInElement(containerRef.current, {
          delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\(', right: '\\)', display: false},
            {left: '\\[', right: '\\]', display: true},
            {left: '\\begin{equation}', right: '\\end{equation}', display: true},
            {left: '\\begin{align}', right: '\\end{align}', display: true},
            {left: '\\begin{alignat}', right: '\\end{alignat}', display: true},
            {left: '\\begin{gather}', right: '\\end{gather}', display: true},
            {left: '\\begin{CD}', right: '\\end{CD}', display: true}
          ],
          throwOnError: false,
          output: 'html',
          strict: false
        });
      }
    };

    loadKatex();

    // Clean up function
    return () => {
      // No cleanup needed for KaTeX
    };
  }, [content]);

  return (
    <div 
      ref={containerRef} 
      className={`${className} text-gray-800`}
      dangerouslySetInnerHTML={{ __html: content }} 
    />
  );
};

// Add KaTeX type declarations
declare global {
  interface Window {
    katex: any;
    renderMathInElement: any;
  }
}

export default LatexRenderer;