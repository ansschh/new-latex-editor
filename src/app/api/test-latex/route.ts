// app/api/test-latex/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { latex } = await request.json();
    
    if (!latex) {
      return NextResponse.json(
        { error: 'LaTeX source is required' },
        { status: 400 }
      );
    }
    
    // Create KaTeX-compatible HTML preview
    const htmlPreview = createKatexHtmlPreview(latex);
    
    return NextResponse.json({
      success: true,
      htmlPreview: htmlPreview
    });
  } catch (error) {
    console.error('Error in test compilation:', error);
    
    return NextResponse.json(
      { error: 'Test compilation failed', message: (error as Error).message },
      { status: 500 }
    );
  }
}

function createKatexHtmlPreview(latex: string) {
  // Extract metadata
  const titleMatch = latex.match(/\\title\{([^}]+)\}/);
  const authorMatch = latex.match(/\\author\{([^}]+)\}/);
  const dateMatch = latex.match(/\\date\{([^}]+)\}/);
  
  const title = titleMatch ? titleMatch[1] : 'Untitled Document';
  const author = authorMatch ? authorMatch[1] : '';
  const date = dateMatch ? dateMatch[1] : (latex.includes('\\today') ? new Date().toLocaleDateString() : '');
  
  // Extract content between \begin{document} and \end{document}
  const documentMatch = latex.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  const documentContent = documentMatch ? documentMatch[1] : latex;
  
  // Process document content with KaTeX-compatible rules
  let processedContent = documentContent
    // Remove \maketitle if present - we'll render our own title
    .replace(/\\maketitle/g, '')
    
    // Process sections and subsections
    .replace(/\\section\{([^}]+)\}/g, '<h2 class="text-2xl font-bold mt-6 mb-3 pb-1 border-b border-gray-300 text-black">$1</h2>')
    .replace(/\\subsection\{([^}]+)\}/g, '<h3 class="text-xl font-semibold mt-5 mb-2 text-black">$1</h3>')
    .replace(/\\subsubsection\{([^}]+)\}/g, '<h4 class="text-lg font-semibold mt-4 mb-2 text-black">$1</h4>')
    
    // Keep equation and math environments intact for KaTeX to process
    // Just clean up a bit for better KaTeX compatibility
    .replace(/\\begin\{equation\}/g, '$$')
    .replace(/\\end\{equation\}/g, '$$')
    .replace(/\\begin\{align\}([\s\S]*?)\\end\{align\}/g, '$$\\begin{aligned}$1\\end{aligned}$$')
    .replace(/\\begin\{array\}([\s\S]*?)\\end\{array\}/g, '$$\\begin{array}$1\\end{array}$$')
    
    // Lists
    .replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, '<ul class="list-disc pl-8 my-4 text-black">$1</ul>')
    .replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, '<ol class="list-decimal pl-8 my-4 text-black">$1</ol>')
    .replace(/\\item\s+/g, '<li class="mb-2">')
    .replace(/(?<=<li class="mb-2">[^\n]+)\n/g, '</li>\n')
    .replace(/(?<=<li class="mb-2">[^\n]+)(?=<li)/g, '</li>')
    .replace(/(?<=<li class="mb-2">[^\n]+)(?=<\/[ou]l>)/g, '</li>')
    
    // Text formatting - leave some for KaTeX to handle, process others directly
    .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
    .replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>')
    .replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>')
    .replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>')
    
    // Tables - simplified conversion
    .replace(/\\begin\{table\}([\s\S]*?)\\end\{table\}/g, '<div class="table-container my-4">$1</div>')
    .replace(/\\begin\{tabular\}\{([^}]+)\}([\s\S]*?)\\end\{tabular\}/g, 
      '<table class="border-collapse border border-gray-300 mx-auto">$2</table>')
    .replace(/([^\\])\\\\/g, '$1</tr><tr>')
    .replace(/&/g, '</td><td class="border border-gray-300 px-3 py-2">')
    
    // Process line breaks within paragraphs
    .replace(/\\\\(?!\])/g, '<br>')
    
    // Process paragraphs - with care to avoid breaking math environments
    .replace(/\n\n(?!\$)/g, '</p><p class="my-3 text-black">');
  
  // Wrap in paragraphs if not already
  if (!processedContent.startsWith('<')) {
    processedContent = '<p class="my-3 text-black">' + processedContent;
  }
  if (!processedContent.endsWith('>')) {
    processedContent += '</p>';
  }
  
  // Create title block if we found title information
  let titleBlock = '';
  if (title) {
    titleBlock = `
      <div class="mb-6 text-center">
        <h1 class="text-3xl font-bold mb-2 text-black">${title}</h1>
        ${author ? `<p class="text-xl mb-1 text-gray-700">${author}</p>` : ''}
        ${date ? `<p class="text-gray-500">${date}</p>` : ''}
      </div>
    `;
  }
  
  return `
    <div class="latex-preview font-serif">
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p class="text-blue-700 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <span>
            <strong>KaTeX Preview Mode:</strong> Using client-side rendering for math expressions.
            For full PDF rendering, please install LaTeX on your server.
          </span>
        </p>
      </div>
      
      <div class="max-w-4xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden p-8">
        ${titleBlock}
        <div class="latex-content prose prose-lg max-w-none text-black">
          ${processedContent}
        </div>
      </div>
    </div>
  `;
}

export async function GET() {
  return NextResponse.json({ message: 'Test LaTeX API endpoint is working' });
}