// services/latexService.ts
// Enhanced LaTeX service with server-side rendering

// Define the API URL for the LaTeX rendering server
const LATEX_SERVER_URL = process.env.NEXT_PUBLIC_LATEX_SERVER_URL || 'http://localhost:3001';

interface CompilationResult {
  success: boolean;
  pdfData?: string;
  htmlPreview?: string;
  log?: string;
  error?: string;
}

/**
 * Main entry point for LaTeX compilation
 * Tries server-side rendering first, falls back to browser-based rendering
 */
// services/latexService.ts
// Updated to handle CORS issues by using inline HTML rendering

// services/latexService.ts
// Updated to better handle PDF data

export async function compileLatex(latex: string): Promise<{
  success: boolean;
  pdfData?: string;
  htmlPreview?: string;
  error?: string;
  log?: string;
}> {
  try {
    console.log("Compiling LaTeX with client-side rendering...");
    
    // Create a fallback browser-rendered preview using KaTeX
    const htmlPreview = createKatexHtmlPreview(latex);
    
    try {
      // Use Next.js API route instead of direct server call
      const response = await fetch('/api/compile-latex', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ latex }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Server compilation failed:", errorData);
        
        // Return the fallback preview when server compilation fails
        return {
          success: true,
          htmlPreview,
          log: "Successfully compiled in browser (fallback)"
        };
      }
      
      // Get response data
      const data = await response.json();
      console.log("Received compilation response:", data);
      
      if (data.success) {
        if (data.pdfData) {
          // Make sure we have a properly formatted data URL
          let pdfData = data.pdfData;
          if (!pdfData.startsWith('data:application/pdf;base64,') && pdfData.match(/^[A-Za-z0-9+/=]+$/)) {
            pdfData = `data:application/pdf;base64,${pdfData}`;
          }
          
          return {
            success: true,
            pdfData,
            log: "Successfully compiled with server"
          };
        } else if (data.htmlPreview) {
          return {
            success: true,
            htmlPreview: data.htmlPreview,
            log: data.message || "Successfully compiled with server"
          };
        } else {
          // If no specific data was returned, use our client-side rendering
          return {
            success: true,
            htmlPreview,
            log: "Successfully compiled in browser (fallback)"
          };
        }
      } else {
        throw new Error(data.error || "Unknown server error");
      }
      
    } catch (serverError) {
      console.warn("Server-side rendering failed, falling back to browser rendering", serverError);
      
      // Return the fallback preview when server compilation fails
      return {
        success: true,
        htmlPreview,
        log: "Successfully compiled in browser (fallback)"
      };
    }
  } catch (error) {
    console.error("LaTeX compilation failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
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

/**
 * Compiles LaTeX using the server-side rendering service
 * 
 */
console.log(`Connecting to LaTeX server at: ${LATEX_SERVER_URL}`);
async function compileLatexWithServer(latexCode: string): Promise<CompilationResult> {
  try {
    const response = await fetch(`${LATEX_SERVER_URL}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        latex: latexCode,
        format: 'pdf'
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to render LaTeX on server');
    }

    const data = await response.json();
    
    return {
      success: true,
      pdfData: `data:application/pdf;base64,${data.data}`,
      log: 'Successfully compiled on server'
    };
  } catch (error) {
    console.error('Server LaTeX compilation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown server compilation error'
    };
  }
}

/**
 * Renders a math formula using the server-side rendering service
 */
export async function renderMathFormula(latexCode: string, displayMode = false): Promise<CompilationResult> {
  try {
    const response = await fetch(`${LATEX_SERVER_URL}/render-math`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        latex: latexCode,
        displayMode
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to render math formula');
    }

    const data = await response.json();
    
    return {
      success: true,
      pdfData: `data:image/png;base64,${data.data}`,
      log: 'Successfully rendered math formula on server'
    };
  } catch (error) {
    console.error('Server math formula rendering failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown math rendering error'
    };
  }
}

/**
 * Generate HTML preview with KaTeX for mathematical expressions
 */
async function generateKatexPreview(latexCode: string): Promise<string> {
  // Extract metadata
  const titleMatch = latexCode.match(/\\title\{([^}]+)\}/);
  const authorMatch = latexCode.match(/\\author\{([^}]+)\}/);
  const dateMatch = latexCode.match(/\\date\{([^}]+)\}/);
  
  const title = titleMatch ? titleMatch[1] : 'Untitled Document';
  const author = authorMatch ? authorMatch[1] : '';
  const date = dateMatch ? dateMatch[1] : (latexCode.includes('\\today') ? new Date().toLocaleDateString() : '');
  
  // Extract content between \begin{document} and \end{document}
  const documentMatch = latexCode.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  const documentContent = documentMatch ? documentMatch[1] : latexCode;
  
  // Process document content for KaTeX
  let processedContent = documentContent
    // Remove \maketitle if present
    .replace(/\\maketitle/g, '')
    
    // Process sections, subsections, etc.
    .replace(/\\section\{([^}]+)\}/g, '<h2 class="text-2xl font-bold mt-6 mb-3 pb-1 border-b border-gray-300 text-black">$1</h2>')
    .replace(/\\subsection\{([^}]+)\}/g, '<h3 class="text-xl font-semibold mt-5 mb-2 text-black">$1</h3>')
    .replace(/\\subsubsection\{([^}]+)\}/g, '<h4 class="text-lg font-semibold mt-4 mb-2 text-black">$1</h4>')
    
    // Process math environments
    .replace(/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g, '$$1$')
    .replace(/\\begin\{align\}([\s\S]*?)\\end\{align\}/g, '$$\\begin{aligned}$1\\end{aligned}$$')
    .replace(/\\begin\{align\*\}([\s\S]*?)\\end\{align\*\}/g, '$$\\begin{aligned}$1\\end{aligned}$$')
    
    // Lists
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
    .replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>')
    
    // Tables (basic support)
    .replace(/\\begin\{table\}([\s\S]*?)\\end\{table\}/g, '<div class="table-container my-4">$1</div>')
    .replace(/\\begin\{tabular\}\{([^}]+)\}([\s\S]*?)\\end\{tabular\}/g, 
      '<table class="border-collapse border border-gray-300 mx-auto"><tbody>$2</tbody></table>')
    .replace(/([^\\])\\\\/g, '$1</tr><tr>')
    .replace(/&/g, '</td><td class="border border-gray-300 px-3 py-2">')
    
    // Line breaks
    .replace(/\\\\(?!\])/g, '<br>')
    
    // Paragraphs
    .replace(/\n\n(?!\$)/g, '</p><p class="my-3 text-black">');
  
  // Wrap in paragraphs
  if (!processedContent.startsWith('<')) {
    processedContent = '<p class="my-3 text-black">' + processedContent;
  }
  if (!processedContent.endsWith('>')) {
    processedContent += '</p>';
  }
  
  // Create title block
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
  
  const renderingType = document.location?.hostname === "localhost" || document.location?.hostname === "127.0.0.1" 
    ? "Server + Browser" 
    : "Browser";
  
  return `
    <div class="latex-preview font-serif">
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p class="text-blue-700">
          <strong>${renderingType} Rendering:</strong> This document preview uses KaTeX for equations.
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

/**
 * Generate a simplified PDF from LaTeX content
 */
async function generatePdf(latexCode: string): Promise<string> {
  try {
    // Dynamically import pdf-lib
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    
    // Extract document structure
    const titleMatch = latexCode.match(/\\title\{([^}]*)\}/);
    const authorMatch = latexCode.match(/\\author\{([^}]*)\}/);
    const documentMatch = latexCode.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
    
    const title = titleMatch ? titleMatch[1] : 'LaTeX Document';
    const author = authorMatch ? authorMatch[1] : '';
    const content = documentMatch ? documentMatch[1] : latexCode;
    
    // Process content to extract text (simplified)
    const textContent = content
      .replace(/\\section\{([^}]+)\}/g, '\n\n$1\n\n')
      .replace(/\\subsection\{([^}]+)\}/g, '\n$1\n')
      .replace(/\\textbf\{([^}]+)\}/g, '$1')
      .replace(/\\textit\{([^}]+)\}/g, '$1')
      .replace(/\\emph\{([^}]+)\}/g, '$1')
      .replace(/\$[^$]+\$/g, '[Math Expression]')
      .replace(/\\\\/g, '\n')
      .replace(/\\maketitle/g, '')
      .replace(/\\begin\{.*?\}.*?\\end\{.*?\}/gs, '[Environment]')
      .replace(/\\item/g, '• ')
      .replace(/\\[a-zA-Z]+(\{.*?\})?/g, '');
    
    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Add a page
    const page = pdfDoc.addPage([612, 792]); // US Letter
    
    // Embed fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    
    // Draw title
    page.drawText(title, {
      x: 72,
      y: 720,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    
    // Draw author
    if (author) {
      page.drawText(author, {
        x: 72,
        y: 690,
        size: 16,
        font: helveticaFont,
        color: rgb(0, 0, 0)
      });
    }
    
    // Draw content (basic implementation)
    const lines = textContent.split('\n');
    let y = 650;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        // Skip to next page if needed
        if (y < 72) {
          const newPage = pdfDoc.addPage([612, 792]);
          y = 720;
          page = newPage;
        }
        
        // Determine if this might be a heading
        const isHeading = trimmedLine.length < 50 && !trimmedLine.includes(' ') && 
          lines.indexOf(line) > 0 && lines[lines.indexOf(line) - 1].trim() === '';
        
        page.drawText(trimmedLine, {
          x: 72,
          y,
          size: isHeading ? 16 : 12,
          font: isHeading ? helveticaBold : helveticaFont,
          color: rgb(0, 0, 0)
        });
        
        y -= isHeading ? 24 : 16;
      } else {
        // Empty line
        y -= 12;
      }
    }
    
    // Draw footer with browser rendering notice
    page.drawText('PDF generated by browser-based LaTeX compiler', {
      x: 72,
      y: 30,
      size: 10,
      font: helveticaOblique,
      color: rgb(0.5, 0.5, 0.5)
    });
    
    // Save PDF
    const pdfBytes = await pdfDoc.save();
    
    // Convert to data URL
    const base64 = arrayBufferToBase64(pdfBytes);
    return `data:application/pdf;base64,${base64}`;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

/**
 * Generate basic HTML preview (fallback option)
 */
function generateBasicPreview(latexCode: string): string {
  // Extract metadata
  const titleMatch = latexCode.match(/\\title\{([^}]+)\}/);
  const authorMatch = latexCode.match(/\\author\{([^}]+)\}/);
  
  const title = titleMatch ? titleMatch[1] : 'Untitled Document';
  const author = authorMatch ? authorMatch[1] : '';
  
  // Extract content
  const documentMatch = latexCode.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  const content = documentMatch ? documentMatch[1] : latexCode;
  
  // Very basic processing
  const processedContent = content
    .replace(/\\section\{([^}]+)\}/g, '<h2>$1</h2>')
    .replace(/\\subsection\{([^}]+)\}/g, '<h3>$1</h3>')
    .replace(/\\maketitle/g, '')
    .replace(/\$([^$]+)\$/g, '<em>$1</em>')
    .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
    .replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>')
    .replace(/\n\n/g, '<br><br>');
  
  return `
    <div style="font-family: serif; padding: 20px;">
      <div style="background-color: #fff3cd; border: 1px solid #ffeeba; padding: 15px; margin-bottom: 20px;">
        <p style="color: #856404;"><strong>Basic Preview:</strong> Enhanced LaTeX rendering is not available.</p>
      </div>
      <h1 style="text-align: center;">${title}</h1>
      <p style="text-align: center;">${author}</p>
      <div>${processedContent}</div>
    </div>
  `;
}

/**
 * Convert ArrayBuffer to Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  return window.btoa(binary);
}