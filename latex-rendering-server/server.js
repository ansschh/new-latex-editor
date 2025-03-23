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
  const { latex, format = 'pdf' } = req.body;
  
  if (!latex) {
    return res.status(400).json({ error: 'LaTeX content is required' });
  }
  
  try {
    // Create temporary directory for the job
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    const inputFile = path.join(tmpDir.name, 'input.tex');
    
    // Write LaTeX content to file
    fs.writeFileSync(inputFile, latex);
    
    // Run pdfLaTeX to generate PDF
    const pdfLatexCmd = `"C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\pdflatex.exe" -interaction=nonstopmode -halt-on-error -output-directory="${tmpDir.name}" "${inputFile}"`;
    
    // Create environment for MiKTeX to avoid privilege issues
    const pdfLatexEnv = {
      ...process.env,
      MIKTEX_USERCONFIG: path.resolve(process.env.USERPROFILE || process.env.HOME, '.miktex'),
      TEXMFVAR: path.resolve(process.env.USERPROFILE || process.env.HOME, '.miktex')
    };
    
    console.log("Running LaTeX command:", pdfLatexCmd);
    
    exec(pdfLatexCmd, { env: pdfLatexEnv }, async (error, stdout, stderr) => {
      console.log("LaTeX stdout:", stdout);
      console.log("LaTeX stderr:", stderr);
      
      if (error) {
        console.error(`Error executing pdflatex: ${error.message}`);
        // Try to extract relevant error message
        const errorLog = fs.existsSync(path.join(tmpDir.name, 'input.log')) 
          ? fs.readFileSync(path.join(tmpDir.name, 'input.log'), 'utf8')
          : stderr;
        
        // Extract the actual error message
        let errorMessage = 'LaTeX compilation failed';
        const errorMatch = errorLog.match(/!(.*?)(?:\n|$)/);
        if (errorMatch) {
          errorMessage = errorMatch[1].trim();
        }
        
        // Clean up
        tmpDir.removeCallback();
        return res.status(500).json({ error: errorMessage });
      }
      
      const pdfPath = path.join(tmpDir.name, 'input.pdf');
      
      // If PDF format is requested, send the PDF
      if (format === 'pdf') {
        if (fs.existsSync(pdfPath)) {
          const pdfData = fs.readFileSync(pdfPath);
          const base64Pdf = pdfData.toString('base64');
          
          // Clean up
          tmpDir.removeCallback();
          
          return res.json({
            format: 'pdf',
            data: base64Pdf
          });
        } else {
          tmpDir.removeCallback();
          return res.status(500).json({ error: 'PDF generation failed' });
        }
      }
      
      // If image format is requested, convert PDF to PNG/JPEG
      if (format === 'png' || format === 'jpg') {
        const density = 300; // Higher density for better quality
        const outputImage = path.join(tmpDir.name, `output.${format}`);
        
        // ImageMagick command for Windows
        const convertCmd = `magick convert -density ${density} -quality 90 "${pdfPath}" "${outputImage}"`;
        
        console.log("Running ImageMagick command:", convertCmd);
        
        exec(convertCmd, (imgError, imgStdout, imgStderr) => {
          console.log("ImageMagick stdout:", imgStdout);
          console.log("ImageMagick stderr:", imgStderr);
          
          if (imgError) {
            console.error(`Error converting PDF to image: ${imgError.message}`);
            tmpDir.removeCallback();
            return res.status(500).json({ error: 'Image conversion failed' });
          }
          
          if (fs.existsSync(outputImage)) {
            const imgData = fs.readFileSync(outputImage);
            const base64Img = imgData.toString('base64');
            
            // Clean up
            tmpDir.removeCallback();
            
            return res.json({
              format,
              data: base64Img
            });
          } else {
            tmpDir.removeCallback();
            return res.status(500).json({ error: 'Image conversion failed' });
          }
        });
      } else {
        // Format not supported
        tmpDir.removeCallback();
        return res.status(400).json({ error: 'Unsupported output format' });
      }
    });
  } catch (error) {
    console.error(`Server error: ${error.message}`);
    return res.status(500).json({ error: 'Server error' });
  }
});

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