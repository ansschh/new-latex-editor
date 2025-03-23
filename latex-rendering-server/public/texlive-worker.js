// public/texlive-worker.js
// This file needs to be placed in your public directory
// Run the following command to download texlive.js:
// curl -L https://github.com/manuels/texlive.js/releases/download/v0.7.1/texlive.js -o public/texlive.js
// curl -L https://github.com/manuels/texlive.js/releases/download/v0.7.1/texlive.wasm -o public/texlive.wasm

importScripts('/texlive.js');

// Initialize the TeX Live compiler
Module.onRuntimeInitialized = () => {
  postMessage({ type: 'ready' });
  
  // Set up a virtual file system for TeX
  FS.mkdir('/work');
  FS.chdir('/work');
};

// Listen for messages from the main thread
self.onmessage = (event) => {
  const { command, latex, jobname = 'document' } = event.data;
  
  if (command === 'compile') {
    try {
      // Write LaTeX source to file
      FS.writeFile(`${jobname}.tex`, latex);
      
      // Run pdflatex on the source
      const exitCode = Module.callMain([
        'pdflatex',
        '-interaction=nonstopmode',
        `${jobname}.tex`
      ]);
      
      // Read the log file
      let logContent = '';
      try {
        logContent = FS.readFile(`${jobname}.log`, { encoding: 'utf8' });
      } catch (e) {
        logContent = 'Error reading log file: ' + e.message;
      }
      
      if (exitCode === 0) {
        // Successful compilation - read the PDF file
        try {
          const pdfContent = FS.readFile(`${jobname}.pdf`);
          
          // Send the PDF data back to the main thread
          postMessage({
            type: 'success',
            pdf: pdfContent.buffer,
            log: logContent
          }, [pdfContent.buffer]); // Transfer the buffer to avoid copying
        } catch (e) {
          postMessage({
            type: 'error',
            error: 'PDF generation failed: ' + e.message,
            log: logContent
          });
        }
      } else {
        // Compilation failed
        postMessage({
          type: 'error',
          error: `Compilation failed with exit code ${exitCode}`,
          log: logContent
        });
      }
      
      // Clean up
      try {
        FS.unlink(`${jobname}.tex`);
        FS.unlink(`${jobname}.pdf`);
        FS.unlink(`${jobname}.log`);
        FS.unlink(`${jobname}.aux`);
      } catch (e) {
        console.error('Error cleaning up files:', e);
      }
    } catch (error) {
      postMessage({
        type: 'error',
        error: error.message || 'Unknown error in texlive.js worker',
        log: 'Error in Web Worker: ' + error.stack
      });
    }
  }
};

// Notify that the worker is loaded
postMessage({ type: 'loaded' });