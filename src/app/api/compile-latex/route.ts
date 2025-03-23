// app/api/compile-latex/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { latex } = await request.json();
    
    if (!latex) {
      return NextResponse.json({ 
        success: false, 
        error: 'LaTeX content is required' 
      }, { status: 400 });
    }
    
    // Create HTML preview (used as fallback)
    const htmlPreview = createKatexHtmlPreview(latex);
    
    try {
      // Try to access the LaTeX server directly (server-to-server)
      const serverResponse = await fetch('http://localhost:3001/render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ latex, format: 'pdf' }),
        // Important for Next.js to not cache this request
        cache: 'no-store'
      });
      
      if (!serverResponse.ok) {
        // If server responds with error, we'll use the HTML fallback
        console.error('LaTeX server error:', await serverResponse.text());
        throw new Error('LaTeX server returned an error response');
      }
      
      const responseData = await serverResponse.json();
      
      // If we got PDF data, return it
      if (responseData.format === 'pdf' && responseData.data) {
        return NextResponse.json({
          success: true,
          pdfData: `data:application/pdf;base64,${responseData.data}`
        });
      } else {
        // No usable data from server, return our HTML preview
        return NextResponse.json({
          success: true,
          htmlPreview,
          message: 'Using browser rendering (server did not return PDF)'
        });
      }
    } catch (error) {
      console.error('Error communicating with LaTeX server:', error);
      
      // Return the HTML preview as fallback
      return NextResponse.json({
        success: true,
        htmlPreview,
        message: 'Using browser rendering (server connection failed)'
      });
    }
  } catch (error) {
    console.error('API route error:', error);
    
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Create KaTeX-compatible HTML preview for client-side rendering
function createKatexHtmlPreview(latex: string): string {
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
    
    // Preserve math expressions for KaTeX
    .replace(/\\begin\{equation\}/g, '$$')
    .replace(/\\end\{equation\}/g, '$$')
    .replace(/\\begin\{align\}([\s\S]*?)\\end\{align\}/g, '$$\\begin{aligned}$1\\end{aligned}$$')
    
    // Process lists
    .replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, '<ul class="list-disc pl-8 my-4 text-black">$1</ul>')
    .replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, '<ol class="list-decimal pl-8 my-4 text-black">$1</ol>')
    .replace(/\\item\s+/g, '<li class="mb-2">')
    .replace(/(?<=<li class="mb-2">[^\n]+)\n/g, '</li>\n')
    .replace(/(?<=<li class="mb-2">[^\n]+)(?=<li)/g, '</li>')
    .replace(/(?<=<li class="mb-2">[^\n]+)(?=<\/[ou]l>)/g, '</li>')
    
    // Text formatting
    .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
    .replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>')
    .replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>')
    
    // Simplified table handling
    .replace(/\\begin\{table\}([\s\S]*?)\\end\{table\}/g, '<div class="table-container my-4">$1</div>')
    .replace(/\\begin\{tabular\}\{([^}]+)\}([\s\S]*?)\\end\{tabular\}/g, 
      '<table class="border-collapse border border-gray-300 mx-auto"><tbody>$2</tbody></table>')
    .replace(/([^\\])\\\\/g, '$1</tr><tr>')
    .replace(/&/g, '</td><td class="border border-gray-300 px-3 py-2">')
    
    // Process references
    .replace(/\\ref\{([^}]+)\}/g, '<span class="text-blue-600">[ref:$1]</span>')
    .replace(/\\cite\{([^}]+)\}/g, '<span class="text-blue-600">[citation:$1]</span>')
    
    // Simple paragraph handling
    .replace(/\n\n/g, '</p><p class="my-3 text-black">');
  
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
      ${titleBlock}
      <div class="latex-content prose prose-lg max-w-none text-black">
        ${processedContent}
      </div>
    </div>
  `;
}

// Health check endpoint to test API availability
export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'LaTeX API route is working' });
}