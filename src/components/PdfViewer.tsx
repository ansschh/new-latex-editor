"use client";

import React, { useEffect, useState, useRef } from 'react';
import {
  Loader, Download, ZoomIn, ZoomOut, RotateCw,
  ChevronLeft, ChevronRight, Maximize, Minimize,
  RefreshCw, Search, X, Printer, MoreVertical
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Import LatexRenderer dynamically
const LatexRenderer = dynamic(() => import('./LatexRenderer'), {
  ssr: false,
  loading: () => <div className="p-4 text-center">Loading LaTeX renderer...</div>
});

interface EnhancedPdfViewerProps {
  pdfData: string | ArrayBuffer | null;
  isLoading: boolean;
  error: string | null;
  htmlPreview?: string;
  documentTitle?: string;
  onRecompileRequest?: () => void;
}

const EnhancedPdfViewer: React.FC<EnhancedPdfViewerProps> = ({
  pdfData,
  isLoading,
  error,
  htmlPreview,
  documentTitle = 'document',
  onRecompileRequest
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [sanitizedPdfUrl, setSanitizedPdfUrl] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);
  const [renderAttempts, setRenderAttempts] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Process PDF data when it changes
  useEffect(() => {
    console.log("Processing PDF data, type:", typeof pdfData);

    // Reset states on new data
    setIframeError(false);
    setShowDownloadPrompt(false);
    setZoom(100);
    setRotation(0);
    setCurrentPage(1);
    setIsSearchOpen(false);
    setSearchQuery('');

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

  // Modified approach to hide PDF.js toolbar - use URL parameters
  useEffect(() => {
    if (sanitizedPdfUrl) {
      // Add URL parameters to disable toolbar for built-in PDF viewers
      // This works with PDF.js and many browser PDF viewers
      const modifyPdfUrl = () => {
        try {
          // Only modify URLs if they're not data URLs (which can't have parameters added)
          if (sanitizedPdfUrl && !sanitizedPdfUrl.startsWith('data:')) {
            const url = new URL(sanitizedPdfUrl);

            // Add parameters to hide toolbar
            url.hash = "#toolbar=0&navpanes=0&scrollbar=0";

            // Update the iframe src
            if (iframeRef.current) {
              iframeRef.current.src = url.toString();
            }
          }
        } catch (e) {
          console.log("Could not modify PDF URL", e);
        }
      };

      modifyPdfUrl();
    }
  }, [sanitizedPdfUrl]);

  // Handle iframe load errors and check if successfully loaded
  useEffect(() => {
    if (!iframeRef.current || !sanitizedPdfUrl) return;

    const handleIframeError = () => {
      console.log("iframe failed to load PDF");
      setIframeError(true);
    };

    const handleIframeLoad = () => {
      try {
        // Check if iframe loaded with valid content
        const contentDoc = iframeRef.current?.contentDocument;
        if (contentDoc && contentDoc.body.innerHTML === '') {
          setIframeError(true);
          setShowDownloadPrompt(true);
        } else {
          // Set placeholder for total pages - in a real implementation,
          // you would extract this from the PDF
          setTotalPages(Math.max(1, Math.round(Math.random() * 10 + 5)));

          // Try to hide toolbar via direct DOM manipulation as backup
          try {
            if (contentDoc) {
              const style = contentDoc.createElement('style');
              style.textContent = `
                #toolbarContainer, #toolbar, .toolbar, .pdf-toolbar, 
                .header, #header, pdf-viewer-toolbar, #viewerContainer .toolbar { 
                  display: none !important;
                  height: 0 !important;
                  min-height: 0 !important;
                  max-height: 0 !important;
                  position: absolute !important;
                  top: -1000px !important;
                  visibility: hidden !important;
                  overflow: hidden !important;
                  opacity: 0 !important;
                  pointer-events: none !important;
                }
                
                body, html, #viewerContainer, #viewer, .pdfViewer, #viewer-container, .page, 
                #outerContainer, #mainContainer, #viewerContainer, pdf-viewer-content {
                  margin: 0 !important;
                  padding: 0 !important;
                  top: 0 !important;
                  left: 0 !important;
                  right: 0 !important;
                  bottom: 0 !important;
                  width: 100% !important;
                  height: 100% !important;
                  max-width: 100% !important;
                  max-height: 100% !important;
                }
              `;
              contentDoc.head.appendChild(style);
            }
          } catch (e) {
            console.log("Could not modify PDF DOM due to security restrictions", e);
          }
        }
      } catch (e) {
        // Access to contentDocument might be blocked by CORS
        console.error("Error accessing iframe content:", e);
        setIframeError(true);
        setShowDownloadPrompt(true);
      }
    };

    iframeRef.current.addEventListener('error', handleIframeError);
    iframeRef.current.addEventListener('load', handleIframeLoad);

    // Set a timeout as a fallback
    const timeout = setTimeout(() => {
      try {
        const contentDoc = iframeRef.current?.contentDocument;
        if (contentDoc && contentDoc.body.innerHTML === '') {
          setIframeError(true);
          setShowDownloadPrompt(true);
        }
      } catch (e) {
        setIframeError(true);
        setShowDownloadPrompt(true);
      }
    }, 3000);

    return () => {
      iframeRef.current?.removeEventListener('error', handleIframeError);
      iframeRef.current?.removeEventListener('load', handleIframeLoad);
      clearTimeout(timeout);
    };
  }, [sanitizedPdfUrl, renderAttempts]);

  // Handle fullscreen toggle
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Function to handle PDF download
  const handleDownloadPdf = () => {
    if (!sanitizedPdfUrl) {
      if (onRecompileRequest) {
        onRecompileRequest();
      }
      return;
    }

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

    if (onRecompileRequest) {
      onRecompileRequest();
    }
  };

  // Function to toggle fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Function to handle zoom
  const handleZoom = (direction: 'in' | 'out') => {
    setZoom(prevZoom => {
      const newZoom = direction === 'in'
        ? Math.min(prevZoom + 25, 300)
        : Math.max(prevZoom - 25, 50);

      if (iframeRef.current) {
        iframeRef.current.style.width = `${newZoom}%`;
        iframeRef.current.style.height = `${newZoom}%`;
        iframeRef.current.style.transformOrigin = 'top left';
      }

      return newZoom;
    });
  };

  // Function to handle rotation
  const handleRotate = () => {
    setRotation(prevRotation => {
      const newRotation = (prevRotation + 90) % 360;

      if (iframeRef.current) {
        iframeRef.current.style.transform = `rotate(${newRotation}deg)`;
      }

      return newRotation;
    });
  };

  // Function to navigate pages
  const changePage = (direction: 'prev' | 'next') => {
    setCurrentPage(prevPage => {
      const newPage = direction === 'next'
        ? Math.min(prevPage + 1, totalPages)
        : Math.max(prevPage - 1, 1);

      // In a real implementation with PDF.js, you would navigate to the specified page
      return newPage;
    });
  };

  // Function to handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();

    if (!searchQuery.trim()) return;

    // In a real implementation, you would use PDF.js to search in the document
    console.log(`Searching for: ${searchQuery}`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center">
          <Loader className="h-10 w-10 text-blue-500 animate-spin" />
          <p className="mt-4 text-gray-400 font-medium">Compiling LaTeX document...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 p-4">
        <div className="max-w-lg p-6 bg-red-900/30 border border-red-800 rounded-lg shadow-sm">
          <h3 className="text-lg font-medium text-red-400 mb-2">Compilation Error</h3>
          <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono bg-red-950/50 p-4 rounded border border-red-800 max-h-80 overflow-auto">
            {error}
          </pre>
          <div className="mt-4 flex justify-end">
            <button
              onClick={onRecompileRequest}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // HTML Preview state
  if (htmlPreview) {
    return (
      <div className="h-full flex flex-col bg-gray-900">
        <div className="bg-gray-800 p-2 flex justify-between items-center border-b border-gray-700">
          <div className="text-gray-300 font-medium">KaTeX Preview</div>
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
              className="bg-gray-800 shadow-md border border-gray-700 rounded-lg overflow-hidden p-8 text-white"
            />
          </div>
        </div>
      </div>
    );
  }

  // No PDF state
  if (!sanitizedPdfUrl) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900">
        <div className="text-center max-w-md p-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-16 w-16 text-gray-600 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-300 text-lg font-medium mb-2">No PDF Document</p>
          <p className="text-gray-400 mb-4">Click "Compile" to generate a PDF preview of your LaTeX document.</p>
          {onRecompileRequest && (
            <button
              onClick={onRecompileRequest}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center mx-auto"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Compile Now
            </button>
          )}
        </div>
      </div>
    );
  }

  // PDF Viewer layout with enhanced toolbar and features
  return (
    <div
      ref={containerRef}
      className="h-full bg-gray-900 relative flex flex-col"
    >
      {/* Top toolbar */}
      <div className="bg-gray-800 text-gray-300 px-3 py-2 flex items-center justify-between shadow-md z-10 border-b border-gray-700">
        <div className="flex items-center space-x-1">
          {/* Document title */}
          <span className="font-medium truncate max-w-[200px]">
            {documentTitle || 'Document'}.pdf
          </span>
        </div>

        <div className="flex items-center space-x-1">
          {/* Page navigation */}
          <div className="flex items-center border-l border-r border-gray-700 px-2 mx-1">
            <button
              onClick={() => changePage('prev')}
              disabled={currentPage <= 1}
              className={`p-1 rounded ${currentPage <= 1 ? 'text-gray-600' : 'hover:bg-gray-700'}`}
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="text-xs mx-2">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => changePage('next')}
              disabled={currentPage >= totalPages}
              className={`p-1 rounded ${currentPage >= totalPages ? 'text-gray-600' : 'hover:bg-gray-700'}`}
              title="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center">
            <button
              onClick={() => handleZoom('out')}
              disabled={zoom <= 50}
              className={`p-1 rounded ${zoom <= 50 ? 'text-gray-600' : 'hover:bg-gray-700'}`}
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>

            <span className="text-xs mx-1">{zoom}%</span>

            <button
              onClick={() => handleZoom('in')}
              disabled={zoom >= 300}
              className={`p-1 rounded ${zoom >= 300 ? 'text-gray-600' : 'hover:bg-gray-700'}`}
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          {/* Rotate button */}
          <button
            onClick={handleRotate}
            className="p-1 rounded hover:bg-gray-700"
            title="Rotate"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          {/* Search button */}
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className={`p-1 rounded ${isSearchOpen ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
            title="Search in document"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Print button */}
          <button
            onClick={() => {
              if (iframeRef.current) {
                iframeRef.current.contentWindow?.print();
              }
            }}
            className="p-1 rounded hover:bg-gray-700"
            title="Print"
          >
            <Printer className="h-4 w-4" />
          </button>

          {/* Download button */}
          <button
            onClick={handleDownloadPdf}
            className="p-1 rounded hover:bg-gray-700"
            title="Download PDF"
          >
            <Download className="h-4 w-4" />
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1 rounded hover:bg-gray-700"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </button>

          {/* More options */}
          <button
            className="p-1 rounded hover:bg-gray-700"
            title="More options"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search bar (conditionally rendered) */}
      {isSearchOpen && (
        <div className="bg-gray-800 px-3 py-2 flex items-center border-b border-gray-700">
          <form onSubmit={handleSearch} className="flex-1 flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in document..."
              className="rounded-l px-3 py-1 text-sm w-full bg-gray-700 border-gray-600 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-r px-3 py-1 text-sm"
            >
              Search
            </button>
          </form>
          <button
            onClick={() => setIsSearchOpen(false)}
            className="ml-2 p-1 text-gray-400 hover:text-white rounded hover:bg-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* PDF Content - with error handling */}
      <div className="flex-1 overflow-auto relative bg-gray-900" style={{ isolation: 'isolate' }}>
        {/* Show iframe if no error */}
        {!iframeError && (
          <div className="h-full flex items-center justify-center">
            <div
              className="relative overflow-auto"
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                isolation: 'isolate' // Modern method of creating a stacking context
              }}
            >
              {/* Add 'loading' attribute to improve performance */}
              <iframe
                key={`pdf-iframe-${renderAttempts}`}
                ref={iframeRef}
                src={sanitizedPdfUrl}
                className="border-0 transition-transform duration-300 ease-in-out"
                title="PDF Preview"
                loading="eager"
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'white', // Make PDF background white for visibility
                  boxShadow: '0px 0px 10px rgba(0, 0, 0, 0.2)',
                  transform: rotation ? `rotate(${rotation}deg)` : undefined
                }}
                // The critical fix: prevent mouse events from affecting parent containers
                onWheel={(e) => e.stopPropagation()}
                onMouseEnter={() => {
                  // On mouse enter, we focus the iframe to ensure it captures scroll events
                  if (iframeRef.current) {
                    iframeRef.current.focus();
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Show download prompt if iframe fails */}
        {showDownloadPrompt && (
          <div className="h-full flex items-center justify-center bg-gray-900">
            <div className="text-center max-w-md p-6">
              <div className="h-16 w-16 mx-auto mb-4 bg-gray-800 rounded-full flex items-center justify-center">
                <Download className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-gray-300 text-lg font-medium mb-2">Unable to display PDF in browser</p>
              <p className="text-gray-400 mb-4">Your browser's security settings are preventing the PDF from being displayed directly.</p>
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 justify-center">
                <button
                  onClick={handleDownloadPdf}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  <Download className="h-4 w-4 inline mr-1" />
                  Download PDF
                </button>
                <button
                  onClick={retryRender}
                  className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                >
                  <RefreshCw className="h-4 w-4 inline mr-1" />
                  Retry Loading
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Show basic error if iframe fails but we're not showing download prompt yet */}
        {iframeError && !showDownloadPrompt && (
          <div className="h-full flex items-center justify-center bg-gray-900">
            <div className="text-center max-w-md p-6">
              <p className="text-gray-300 text-lg font-medium mb-2">Preparing PDF preview...</p>
              <Loader className="h-8 w-8 text-blue-500 animate-spin mx-auto" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedPdfViewer;