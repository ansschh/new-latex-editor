// services/serverLatexService.ts
interface CompilationResult {
    success: boolean;
    pdfData?: string;
    htmlPreview?: string;
    log?: string;
    error?: string;
  }
  
  const LATEX_SERVER_URL = process.env.NEXT_PUBLIC_LATEX_SERVER_URL || 'http://localhost:3001';
  console.log(`Connecting to LaTeX server at: ${LATEX_SERVER_URL}`);
  
  /**
   * Compiles LaTeX using the server-side rendering service
   */
  export async function compileLatexWithServer(latexCode: string): Promise<CompilationResult> {
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
      
        console.log("Server response status:", response.status);
        
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