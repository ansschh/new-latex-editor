// app/api/mock-compile/route.ts
// Update the createEnhancedHtmlPreview function

function createEnhancedHtmlPreview(latex: string) {
    // Extract metadata
    const titleMatch = latex.match(/\\title\{([^}]+)\}/);
    const authorMatch = latex.match(/\\author\{([^}]+)\}/);
    const title = titleMatch ? titleMatch[1] : 'Untitled Document';
    const author = authorMatch ? authorMatch[1] : 'Unknown Author';
    
    // Extract content between \begin{document} and \end{document}
    const documentMatch = latex.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
    const documentContent = documentMatch ? documentMatch[1] : latex;
    
    // Process document content with improved rendering
    let processedContent = documentContent
      // Process sections
      .replace(/\\section\{([^}]+)\}/g, '<h2 class="text-xl font-bold mt-4 mb-2 border-b border-gray-300 pb-1 text-black">$1</h2>')
      .replace(/\\subsection\{([^}]+)\}/g, '<h3 class="text-lg font-semibold mt-3 mb-2 text-black">$1</h3>')
      
      // Process equations with proper MathJax delimiters
      .replace(/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g, '<div class="my-4 text-center text-black">$$$$1$$</div>')
      .replace(/\\begin\{align\}([\s\S]*?)\\end\{align\}/g, '<div class="my-4 text-center text-black">$$\\begin{aligned}$1\\end{aligned}$$</div>')
      
      // Process inline math
      .replace(/\$([^$]+)\$/g, '$$1$')
      
      // Process lists
      .replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, '<ul class="list-disc pl-8 my-3 space-y-1 text-black">$1</ul>')
      .replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, '<ol class="list-decimal pl-8 my-3 space-y-1 text-black">$1</ol>')
      .replace(/\\item\s+([^\n]+)/g, '<li class="mb-1">$1</li>')
      
      // Process text formatting
      .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
      .replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>')
      .replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>')
      
      // Process maketitle
      .replace(/\\maketitle/g, '')
      
      // Process references
      .replace(/\\ref\{([^}]+)\}/g, '<span class="text-blue-600">[ref:$1]</span>')
      .replace(/\\cite\{([^}]+)\}/g, '<span class="text-blue-600">[citation:$1]</span>')
      
      // Process paragraphs
      .replace(/\n\n/g, '</p><p class="my-2 text-black">')
      
      // Process tables (basic)
      .replace(/\\begin\{tabular\}\{([^}]+)\}([\s\S]*?)\\end\{tabular\}/g, 
        '<div class="overflow-x-auto"><table class="min-w-full border border-gray-300 my-4"><tbody>$2</tbody></table></div>')
      .replace(/([^\\])\\\\/g, '$1</tr><tr>')
      .replace(/&/g, '</td><td class="border px-3 py-2 text-black">')
      .replace(/<tr>(.*?)<\/td>/g, '<tr><td class="border px-3 py-2 text-black">$1');
    
    // Wrap in paragraphs
    processedContent = '<p class="my-2 text-black">' + processedContent + '</p>';
    
    return `
      <div class="latex-preview font-serif">
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p class="text-blue-700">
            <strong>Preview Mode:</strong> This is a client-side rendering of your LaTeX document.
            For full PDF compilation, please install LaTeX or configure Docker.
          </p>
        </div>
        
        <div class="max-w-3xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden">
          <div class="p-6">
            <h1 class="text-2xl font-bold text-center mb-1 text-black">${title}</h1>
            <p class="text-center text-gray-700 mb-6">${author}</p>
            <div class="latex-content prose prose-sm max-w-none text-black">
              ${processedContent}
            </div>
          </div>
        </div>
      </div>
    `;
  }