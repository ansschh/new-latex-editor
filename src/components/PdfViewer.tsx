"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Loader, Download, Eye, RefreshCw } from 'lucide-react';
import dynamic from 'next/dynamic';

// Import LatexRenderer dynamically
const LatexRenderer = dynamic(() => import('./LatexRenderer'), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading LaTeX renderer...</div>
});

interface PdfViewerProps {
  pdfData: string | ArrayBuffer | null;
  isLoading: boolean;
  error: string | null;
  htmlPreview?: string;
  documentTitle?: string;
}

const CSPSafePdfViewer: React.FC<PdfViewerProps> = ({
  pdfData,
  isLoading,
  error,
  htmlPreview,
  documentTitle = 'document'
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [sanitizedPdfUrl, setSanitizedPdfUrl] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);
  const [renderAttempts, setRenderAttempts] = useState(0);

  // Process PDF data when it changes
  useEffect(() => {
    console.log("Processing PDF data, type:", typeof pdfData);
    
    // Reset states on new data
    setIframeError(false);
    setShowDownloadPrompt(false);
    
    if (!pdfData) {
      setSanitizedPdfUrl(null);
      return;
    }
    
    try {
      // Handle string PDF data
      if (typeof pdfData === 'string') {
        console.log("PDF string starts with:", pdfData.substring(0, 50));
        
        // Try to parse as JSON
        try {
          const jsonData = JSON.parse(pdfData);
          if (jsonData.pdfData) {
            setSanitizedPdfUrl(jsonData.pdfData);
          } else if (jsonData.data) {
            setSanitizedPdfUrl(`data:application/pdf;base64,${jsonData.data}`);
          } else {
            setSanitizedPdfUrl(pdfData);
          }
        } catch (e) {
          // Not JSON, process as string
          if (pdfData.startsWith('data:application/pdf')) {
            setSanitizedPdfUrl(pdfData);
          } else if (pdfData.startsWith('JVBER') || pdfData.match(/^[A-Za-z0-9+/=]+$/)) {
            setSanitizedPdfUrl(`data:application/pdf;base64,${pdfData}`);
          } else {
            setSanitizedPdfUrl(pdfData);
          }
        }
      } 
      // Handle ArrayBuffer
      else if (pdfData instanceof ArrayBuffer) {
        const blob = new Blob([pdfData], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setSanitizedPdfUrl(url);
      }
    } catch (err) {
      console.error("Error processing PDF data:", err);
      setIframeError(true);
    }
  }, [pdfData]);

  // Handle iframe load errors
  useEffect(() => {
    if (!iframeRef.current || !sanitizedPdfUrl) return;
    
    const handleIframeError = () => {
      console.log("iframe failed to load PDF");
      setIframeError(true);
    };
    
    iframeRef.current.addEventListener('error', handleIframeError);
    
    // Set a timeout to check if iframe loaded successfully
    const timeout = setTimeout(() => {
      try {
        const contentDoc = iframeRef.current?.contentDocument;
        if (contentDoc && contentDoc.body.innerHTML === '') {
          setIframeError(true);
          setShowDownloadPrompt(true);
        }
      } catch (e) {
        // Access to contentDocument might be blocked by CORS, which indicates an issue
        setIframeError(true);
        setShowDownloadPrompt(true);
      }
    }, 2000);
    
    return () => {
      iframeRef.current?.removeEventListener('error', handleIframeError);
      clearTimeout(timeout);
    };
  }, [sanitizedPdfUrl, renderAttempts]);

  // Function to handle PDF download
  const handleDownloadPdf = () => {
    if (!sanitizedPdfUrl) return;
    
    const link = document.createElement('a');
    link.href = sanitizedPdfUrl;
    link.download = `${documentTitle || 'document'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Function to retry rendering
  const retryRender = () => {
    setIframeError(false);
    setShowDownloadPrompt(false);
    setRenderAttempts(prev => prev + 1);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="flex flex-col items-center">
          <Loader className="h-10 w-10 text-blue-500 animate-spin" />
          <p className="mt-4 text-gray-600 font-medium">Compiling LaTeX document...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 p-4">
        <div className="max-w-lg p-6 bg-red-50 border border-red-200 rounded-lg shadow-sm">
          <h3 className="text-lg font-medium text-red-700 mb-2">Compilation Error</h3>
          <pre className="text-sm text-red-600 whitespace-pre-wrap font-mono bg-red-50 p-4 rounded border border-red-100 max-h-80 overflow-auto">
            {error}
          </pre>
        </div>
      </div>
    );
  }

  // HTML Preview state
  if (htmlPreview) {
    return (
      <div className="h-full flex flex-col bg-gray-100">
        <div className="bg-gray-200 p-2 flex justify-between items-center border-b border-gray-300">
          <div className="text-gray-700 font-medium">KaTeX Preview</div>
          <div className="flex items-center">
            <button
              onClick={handleDownloadPdf}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded flex items-center"
            >
              <Download className="h-4 w-4 mr-1" />
              Download PDF
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="mx-auto">
            <LatexRenderer
              content={htmlPreview}
              className="bg-white shadow-md border border-gray-300 rounded-lg overflow-hidden p-8 text-black"
            />
          </div>
        </div>
      </div>
    );
  }

  // No PDF state
  if (!sanitizedPdfUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="text-center max-w-md p-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-16 w-16 text-gray-400 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-600 text-lg font-medium mb-2">No PDF Document</p>
          <p className="text-gray-500">Click "Compile" to generate a PDF preview of your LaTeX document.</p>
        </div>
      </div>
    );
  }

  // PDF Viewer layout with fallback handling
  return (
    <div className="h-full bg-gray-100 relative flex flex-col">

      {/* PDF Content - with error handling */}
      <div className="flex-1 relative">
        {/* Show iframe if no error */}
        {!iframeError && (
          <iframe
            key={`pdf-iframe-${renderAttempts}`}
            ref={iframeRef}
            src={sanitizedPdfUrl}
            className="w-full h-full border-0"
            title="PDF Preview"
          />
        )}

        {/* Show download prompt if iframe fails */}
        {showDownloadPrompt && (
          <div className="h-full flex items-center justify-center bg-white">
            <div className="text-center max-w-md p-6">
              <Eye className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg font-medium mb-2">Unable to display PDF in browser</p>
              <p className="text-gray-500 mb-4">Your browser's security settings are preventing the PDF from being displayed directly.</p>
              <button
                onClick={handleDownloadPdf}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Download PDF Instead
              </button>
            </div>
          </div>
        )}
        
        {/* Show basic error if iframe fails but we're not showing download prompt yet */}
        {iframeError && !showDownloadPrompt && (
          <div className="h-full flex items-center justify-center bg-white">
            <div className="text-center max-w-md p-6">
              <p className="text-gray-600 text-lg font-medium mb-2">Preparing PDF preview...</p>
              <Loader className="h-8 w-8 text-blue-500 animate-spin mx-auto" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CSPSafePdfViewer;