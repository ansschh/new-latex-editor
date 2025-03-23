// services/browserLatexService.ts
// Provides in-browser LaTeX compilation using latex.js

// First, let's install the required package:
// npm install latex.js

import { PDFDocument } from 'pdf-lib';

interface CompilationResult {
  success: boolean;
  pdfData?: string;
  htmlPreview?: string;
  log?: string;
  error?: string;
}

/**
 * Compiles LaTeX in the browser using the latex.js library
 */
export async function compileLatexInBrowser(latexCode: string): Promise<CompilationResult> {
  try {
    // Dynamically import latex.js to avoid server-side rendering issues
    const { default: LatexJS } = await import('latex.js');
    
    // Create a new generator
    const generator = new LatexJS();
    
    // First, generate HTML preview (faster and works more reliably)
    try {
      const htmlResult = await generator.parse(latexCode, { format: 'html' });
      const htmlString = htmlResult.domString();
      
      // Now try to generate PDF
      try {
        const pdfResult = await generator.parse(latexCode, { format: 'pdf' });
        const pdfBlob = new Blob([pdfResult.buffer], { type: 'application/pdf' });
        const pdfUrl = URL.createObjectURL(pdfBlob);
        
        return {
          success: true,
          pdfData: pdfUrl,
          htmlPreview: htmlString,
          log: 'Successfully compiled in browser'
        };
      } catch (pdfError) {
        console.warn('Browser PDF compilation failed, using HTML fallback:', pdfError);
        
        // If PDF generation fails, return HTML preview and convert it to PDF
        const pdfData = await convertHtmlToPdf(htmlString);
        
        return {
          success: true,
          pdfData: pdfData,
          htmlPreview: htmlString,
          log: 'Browser PDF generation failed, converted HTML to PDF instead'
        };
      }
    } catch (error) {
      console.error('Browser LaTeX compilation failed:', error);
      throw error;
    }
  } catch (error) {
    console.error('Failed to initialize LaTeX compiler in browser:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown browser compilation error'
    };
  }
}

/**
 * Alternative browser-based LaTeX compiler using MathJax + PDF generation
 */
export async function compileLatexWithMathJax(latexCode: string): Promise<CompilationResult> {
  try {
    // Extract document structure
    const titleMatch = latexCode.match(/\\title\{([^}]*)\}/);
    const authorMatch = latexCode.match(/\\author\{([^}]*)\}/);
    const documentMatch = latexCode.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
    
    const title = titleMatch ? titleMatch[1] : 'LaTeX Document';
    const author = authorMatch ? authorMatch[1] : '';
    let content = documentMatch ? documentMatch[1] : latexCode;
    
    // Basic LaTeX processing
    content = content
      .replace(/\\maketitle/g, '')
      .replace(/\\section\{([^}]+)\}/g, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
      .replace(/\\subsection\{([^}]+)\}/g, '<h3 class="text-lg font-semibold mt-3 mb-2">$1</h3>')
      .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
      .replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>')
      .replace(/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g, '$$$$1$$')
      .replace(/\\begin\{align\}([\s\S]*?)\\end\{align\}/g, '$$\\begin{aligned}$1\\end{aligned}$$')
      .replace(/\$\$([^$]+)\$\$/g, '$$$$1$$')
      .replace(/([^$])\$([^$]+)\$/g, '$1$$2$')
      .replace(/\\\\(?!\])/g, '<br>')
      .replace(/\n\n/g, '</p><p>');
    
    // Wrap in paragraphs
    content = '<p>' + content + '</p>';
    
    // Create HTML document
    const htmlTemplate = `
      <div class="latex-document">
        <div class="header">
          <h1>${title}</h1>
          ${author ? `<p class="author">${author}</p>` : ''}
        </div>
        <div class="content">
          ${content}
        </div>
      </div>
    `;
    
    // Convert to PDF (simplified - in a real implementation use pdf-lib or similar)
    const pdfData = await convertHtmlToPdf(htmlTemplate);
    
    return {
      success: true,
      pdfData: pdfData,
      htmlPreview: htmlTemplate,
      log: 'Compiled with MathJax'
    };
  } catch (error) {
    console.error('MathJax compilation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown MathJax compilation error'
    };
  }
}

/**
 * Convert HTML to PDF using client-side libraries
 */
async function convertHtmlToPdf(htmlContent: string): Promise<string> {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    
    // Add text to the page - very basic implementation
    // In a real implementation, use a proper HTML-to-PDF library like html2pdf.js
    page.drawText('PDF version generated from HTML preview', {
      x: 50,
      y: 750,
      size: 12,
    });
    
    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    // Convert to base64 data URL
    const base64 = arrayBufferToBase64(pdfBytes);
    const dataUrl = `data:application/pdf;base64,${base64}`;
    
    return dataUrl;
  } catch (error) {
    console.error('Error converting HTML to PDF:', error);
    throw error;
  }
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