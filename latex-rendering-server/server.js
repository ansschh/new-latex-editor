const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const tmp = require('tmp');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Create a temporary directory for outputs
const outputDir = path.join(__dirname, 'temp');
fs.ensureDirSync(outputDir);

// Clean up temp files older than 1 hour
const cleanupTempFiles = () => {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  
  fs.readdir(outputDir, (err, files) => {
    if (err) return console.error('Error reading temp directory:', err);
    
    files.forEach(file => {
      const filePath = path.join(outputDir, file);
      fs.stat(filePath, (statErr, stats) => {
        if (statErr) return console.error(`Error stating file ${file}:`, statErr);
        
        if (stats.isFile() && stats.mtime < oneHourAgo) {
          fs.unlink(filePath, unlinkErr => {
            if (unlinkErr) console.error(`Error removing file ${file}:`, unlinkErr);
          });
        }
      });
    });
  });
};

// Schedule cleanup every hour
setInterval(cleanupTempFiles, 60 * 60 * 1000);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'LaTeX rendering service is running' });
});

// Full document rendering endpoint
app.post('/render', async (req, res) => {
    const { latex, format = 'pdf', images = [] } = req.body;
    
    if (!latex) {
      return res.status(400).json({ error: 'LaTeX content is required' });
    }
    
    try {
      // Create temporary directory for the job
      const tmpDir = tmp.dirSync({ unsafeCleanup: true });
      const inputFile = path.join(tmpDir.name, 'input.tex');
      
      console.log(`Created temporary directory: ${tmpDir.name}`);
      console.log(`LaTeX content length: ${latex.length}`);
      console.log(`Received ${images.length} images`);
      
      // Create an images subfolder to keep things organized
      const imagesDir = path.join(tmpDir.name, 'images');
      fs.mkdirSync(imagesDir, { recursive: true });
      
      // Process images first (if provided)
      if (images && images.length > 0) {
        console.log(`Processing ${images.length} images`);
        
        for (const image of images) {
          try {
            if (image.name && image.data) {
              // Save image both to the root directory AND the images subdirectory
              // This gives LaTeX multiple places to find the images
              const mainPath = path.join(tmpDir.name, image.name);
              const imagePath = path.join(imagesDir, image.name);
              
              // Ensure image data is base64
              let imageData;
              if (image.data.startsWith('data:')) {
                // Extract base64 from data URL
                const matches = image.data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                  imageData = Buffer.from(matches[2], 'base64');
                } else {
                  throw new Error("Invalid data URL format");
                }
              } else {
                // Assume it's already base64
                imageData = Buffer.from(image.data, 'base64');
              }
              
              // Write to both locations
              fs.writeFileSync(mainPath, imageData);
              fs.writeFileSync(imagePath, imageData);
              
              console.log(`Saved image ${image.name} to multiple locations (${imageData.length} bytes)`);
              console.log(`- ${mainPath}`);
              console.log(`- ${imagePath}`);
              
              // Verify the files were created
              if (fs.existsSync(mainPath)) {
                const stats = fs.statSync(mainPath);
                console.log(`Main file exists with size: ${stats.size} bytes`);
              }
              
              if (fs.existsSync(imagePath)) {
                const stats = fs.statSync(imagePath);
                console.log(`Image dir file exists with size: ${stats.size} bytes`);
              }
            } else {
              console.log(`Missing name or data for image`);
            }
          } catch (imgError) {
            console.error(`Error processing image ${image?.name}:`, imgError);
          }
        }
      }
      
      // Modify LaTeX content to include multiple graphicspath options
      let processedLaTeX = latex;
      
      // Add graphicspath if it doesn't exist
      if (!processedLaTeX.includes('\\graphicspath')) {
        // Create a graphicspath command that includes multiple possible locations
        const graphicsPathCmd = '\\graphicspath{{./}{./images/}{.}}\n';
        
        // Add after documentclass and packages but before begin document
        if (processedLaTeX.includes('\\begin{document}')) {
          processedLaTeX = processedLaTeX.replace(
            /(\\begin\{document\})/,
            `${graphicsPathCmd}$1`
          );
        } else {
          // If no begin document, add at the beginning
          processedLaTeX = graphicsPathCmd + processedLaTeX;
        }
        
        console.log("Added graphicspath command to LaTeX");
      }
      
      // Write LaTeX content to file
      fs.writeFileSync(inputFile, processedLaTeX);
      console.log(`LaTeX content written to ${inputFile}`);
      
      // Check that all files are in place
      console.log('Files in temp directory:');
      listFilesRecursively(tmpDir.name);
      
      // Run pdfLaTeX to generate PDF
      const pdfLatexCmd = `"C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\pdflatex.exe" -interaction=nonstopmode -halt-on-error -output-directory="${tmpDir.name}" "${inputFile}"`;
      
      // Create environment for MiKTeX to avoid privilege issues
      const pdfLatexEnv = {
        ...process.env,
        MIKTEX_USERCONFIG: path.resolve(process.env.USERPROFILE || process.env.HOME, '.miktex'),
        TEXMFVAR: path.resolve(process.env.USERPROFILE || process.env.HOME, '.miktex')
      };
      
      console.log("Running LaTeX command:", pdfLatexCmd);
      
      // Run pdfLaTeX TWICE to ensure proper references
      exec(pdfLatexCmd, { env: pdfLatexEnv }, async (error, stdout, stderr) => {
        console.log("First LaTeX run stdout:", stdout);
        
        // Even if the first run had errors, run it a second time
        console.log("Running LaTeX command a second time");
        
        exec(pdfLatexCmd, { env: pdfLatexEnv }, async (error2, stdout2, stderr2) => {
          if (error2) {
            console.error(`Error executing pdflatex:`, error2.message);
            
            // Save the log file for debugging
            if (fs.existsSync(path.join(tmpDir.name, 'input.log'))) {
              const logContent = fs.readFileSync(path.join(tmpDir.name, 'input.log'), 'utf8');
              const debugLogPath = path.join(outputDir, `latex-log-${Date.now()}.txt`);
              fs.writeFileSync(debugLogPath, logContent);
              console.log(`Saved LaTeX log to ${debugLogPath}`);
            }
            
            // Extract error message
            let errorMessage = 'LaTeX compilation failed';
            const errorLog = fs.existsSync(path.join(tmpDir.name, 'input.log')) 
              ? fs.readFileSync(path.join(tmpDir.name, 'input.log'), 'utf8')
              : stderr2;
            
            const errorMatch = errorLog.match(/!(.*?)(?:\n|$)/);
            if (errorMatch) {
              errorMessage = errorMatch[1].trim();
            }
            
            tmpDir.removeCallback();
            return res.status(500).json({ error: errorMessage });
          }
          
          const pdfPath = path.join(tmpDir.name, 'input.pdf');
          
          // If PDF format is requested, send the PDF
          if (format === 'pdf') {
            if (fs.existsSync(pdfPath)) {
              const pdfData = fs.readFileSync(pdfPath);
              const base64Pdf = pdfData.toString('base64');
              
              console.log(`Successfully generated PDF (${pdfData.length} bytes)`);
              
              // Clean up
              tmpDir.removeCallback();
              
              return res.json({
                format: 'pdf',
                data: base64Pdf
              });
            } else {
              console.error('PDF file not found at expected path');
              
              // List all files in the temp directory
              console.log('Files in temp directory after compilation:');
              listFilesRecursively(tmpDir.name);
              
              tmpDir.removeCallback();
              return res.status(500).json({ error: 'PDF generation failed - output file not found' });
            }
          }
          
          // Clean up
          tmpDir.removeCallback();
          return res.status(400).json({ error: 'Unsupported output format' });
        });
      });
    } catch (error) {
      console.error(`Server error:`, error);
      return res.status(500).json({ error: 'Server error' });
    }
  });
  
  // Helper function to list all files in a directory recursively
  function listFilesRecursively(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        console.log(`[DIR] ${filePath}`);
        listFilesRecursively(filePath);
      } else {
        console.log(`[FILE] ${filePath} (${stats.size} bytes)`);
      }
    });
  }

// Math formula rendering endpoint
app.post('/render-math', async (req, res) => {
  const { latex, displayMode = false } = req.body;
  
  if (!latex) {
    return res.status(400).json({ error: 'LaTeX math content is required' });
  }
  
  try {
    // Create temporary directory for the job
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    const inputFile = path.join(tmpDir.name, 'input.tex');
    
    // Create a complete LaTeX document with just the math formula
    const fullLatex = `
\\documentclass{article}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage[active,tightpage]{preview}
\\usepackage{xcolor}
\\begin{document}
\\begin{preview}
${displayMode ? `\\begin{align*}${latex}\\end{align*}` : `$${latex}$`}
\\end{preview}
\\end{document}
`;
    
    // Write LaTeX content to file
    fs.writeFileSync(inputFile, fullLatex);
    
    // Run pdfLaTeX to generate PDF with environment settings
    const pdfLatexCmd = `"C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\pdflatex.exe" -interaction=nonstopmode -halt-on-error -output-directory="${tmpDir.name}" "${inputFile}"`;
    
    // Create environment for MiKTeX to avoid privilege issues
    const pdfLatexEnv = {
      ...process.env,
      MIKTEX_USERCONFIG: path.resolve(process.env.USERPROFILE || process.env.HOME, '.miktex'),
      TEXMFVAR: path.resolve(process.env.USERPROFILE || process.env.HOME, '.miktex')
    };
    
    console.log("Running LaTeX math command:", pdfLatexCmd);
    
    exec(pdfLatexCmd, { env: pdfLatexEnv }, async (error, stdout, stderr) => {
      console.log("LaTeX math stdout:", stdout);
      console.log("LaTeX math stderr:", stderr);
      
      if (error) {
        // Handle error
        const errorLog = fs.existsSync(path.join(tmpDir.name, 'input.log')) 
          ? fs.readFileSync(path.join(tmpDir.name, 'input.log'), 'utf8')
          : stderr;
        
        let errorMessage = 'LaTeX compilation failed';
        const errorMatch = errorLog.match(/!(.*?)(?:\n|$)/);
        if (errorMatch) {
          errorMessage = errorMatch[1].trim();
        }
        
        tmpDir.removeCallback();
        return res.status(500).json({ error: errorMessage });
      }
      
      const pdfPath = path.join(tmpDir.name, 'input.pdf');
      const outputPng = path.join(tmpDir.name, 'output.png');
      
      // Convert PDF to PNG with transparent background
      const convertCmd = `magick convert -density 300 -background white -alpha remove "${pdfPath}" "${outputPng}"`;
      
      console.log("Running ImageMagick math command:", convertCmd);
      
      exec(convertCmd, (imgError, imgStdout, imgStderr) => {
        console.log("ImageMagick math stdout:", imgStdout);
        console.log("ImageMagick math stderr:", imgStderr);
        
        if (imgError) {
          console.error(`Error converting PDF to image: ${imgError.message}`);
          tmpDir.removeCallback();
          return res.status(500).json({ error: 'Image conversion failed' });
        }
        
        if (fs.existsSync(outputPng)) {
          const imgData = fs.readFileSync(outputPng);
          const base64Img = imgData.toString('base64');
          
          // Clean up
          tmpDir.removeCallback();
          
          return res.json({
            format: 'png',
            data: base64Img
          });
        } else {
          tmpDir.removeCallback();
          return res.status(500).json({ error: 'Image conversion failed' });
        }
      });
    });
  } catch (error) {
    console.error(`Server error: ${error.message}`);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`LaTeX rendering server running on port ${PORT}`);
});