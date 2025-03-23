"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Loader } from 'lucide-react';
import dynamic from 'next/dynamic';

interface PdfViewerProps {
  pdfData: string | ArrayBuffer | null;
  isLoading: boolean;
  error: string | null;
  htmlPreview?: string;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ 
  pdfData, 
  isLoading, 
  error,
  htmlPreview
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFrameLoaded, setIsFrameLoaded] = useState(false);

  useEffect(() => {
    // Reset frame loaded state when pdf data changes
    if (pdfData) {
      setIsFrameLoaded(false);
    }
  }, [pdfData]);

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

  if (!pdfData) {
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

  return (
    <div className="h-full bg-gray-100 relative">
      {!isFrameLoaded && typeof pdfData === 'string' && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-50 bg-opacity-90">
          <Loader className="h-8 w-8 text-blue-500 animate-spin" />
        </div>
      )}
      
      {typeof pdfData === 'string' && pdfData.startsWith('data:application/pdf') ? (
        <iframe 
          ref={iframeRef}
          src={pdfData}
          className="w-full h-full border-0"
          title="PDF Preview"
          onLoad={() => setIsFrameLoaded(true)}
        />
      ) : (
        <div className="h-full flex items-center justify-center">
          <div className="text-center p-8 bg-yellow-50 border border-yellow-200 rounded-lg max-w-md">
            <p className="text-yellow-700 mb-2 font-medium">PDF data is in an unexpected format</p>
            <p className="text-yellow-600 text-sm">Try recompiling the document or check console for errors.</p>
            <div className="mt-4 p-3 bg-yellow-100 rounded text-xs font-mono text-yellow-800 overflow-auto max-h-40">
              {typeof pdfData === 'string'
                ? pdfData.substring(0, 100) + '...'
                : 'Binary data received but could not be displayed'
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfViewer;