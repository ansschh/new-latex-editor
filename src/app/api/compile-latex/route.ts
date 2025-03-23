// app/api/compile-latex/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDoc, doc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function POST(request: NextRequest) {
  try {
    const { latex, projectId } = await request.json();
    
    if (!latex) {
      return NextResponse.json({ 
        success: false, 
        error: 'LaTeX content is required' 
      }, { status: 400 });
    }
    
    // Extract image references from LaTeX content
    const imageReferences = extractImageReferences(latex);
    console.log('Found image references:', imageReferences);

    // Array to hold image data to send to the LaTeX server
    const imagesToSend = [];
    
    try {
      // If projectId is provided, try to fetch the images from Firestore
      if (projectId && imageReferences.length > 0) {
        // Create a query to find all project files
        const filesQuery = query(
          collection(db, "projectFiles"),
          where("projectId", "==", projectId)
        );
        
        const querySnapshot = await getDocs(filesQuery);
        const projectFiles = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log(`Found ${projectFiles.length} project files`);
        
        // For each image reference, try to find a matching file
        for (const imgRef of imageReferences) {
          console.log(`Looking for image: ${imgRef}`);
          
          // Try different ways to match the filename
          const matchingFile = projectFiles.find(file => 
            file.name === imgRef || 
            file.name === `/${imgRef}` ||
            file.name.endsWith(`/${imgRef}`) ||
            file.name.toLowerCase() === imgRef.toLowerCase() ||
            (file.name.toLowerCase().includes(".jpg") || 
             file.name.toLowerCase().includes(".png") || 
             file.name.toLowerCase().includes(".jpeg")) && 
            file.name.toLowerCase().includes(imgRef.toLowerCase().replace(/\.[^/.]+$/, ""))
          );
          
          if (matchingFile) {
            console.log(`Found matching file for ${imgRef}: ${matchingFile.name}`);
            
            // Check different ways the image data might be stored
            if (matchingFile.dataUrl) {
              console.log(`Using dataUrl field for ${imgRef}`);
              
              // Extract the base64 data from the data URL if needed
              if (matchingFile.dataUrl.startsWith('data:')) {
                const matches = matchingFile.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                
                if (matches && matches.length === 3) {
                  const base64Data = matches[2];
                  console.log(`Extracted base64 data for ${imgRef} (${base64Data.length} chars)`);
                  
                  imagesToSend.push({
                    name: imgRef,
                    data: base64Data,
                    type: matches[1]
                  });
                } else {
                  console.log(`Could not extract base64 data from dataUrl for ${imgRef}`);
                }
              } else {
                // Assume it's already base64
                console.log(`Using dataUrl as base64 directly for ${imgRef}`);
                imagesToSend.push({
                  name: imgRef,
                  data: matchingFile.dataUrl,
                  type: 'image/jpeg' // Default type
                });
              }
            } 
            else if (matchingFile.content && typeof matchingFile.content === 'string' && 
                    (matchingFile.content.startsWith('data:') || 
                     matchingFile.content.match(/^[A-Za-z0-9+/=]+$/))) {
              console.log(`Using content field for ${imgRef}`);
              
              // If content looks like a data URL or base64
              if (matchingFile.content.startsWith('data:')) {
                const matches = matchingFile.content.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                
                if (matches && matches.length === 3) {
                  imagesToSend.push({
                    name: imgRef,
                    data: matches[2],
                    type: matches[1]
                  });
                }
              } else if (matchingFile.content.match(/^[A-Za-z0-9+/=]+$/)) {
                // Appears to be base64 directly
                imagesToSend.push({
                  name: imgRef,
                  data: matchingFile.content,
                  type: 'image/jpeg' // Default type
                });
              }
            }
            else if (matchingFile.url) {
              console.log(`Found URL for ${imgRef}: ${matchingFile.url}`);
              // For URLs, we'd typically need to fetch them server-side
              // This would require additional server-side code
              // For now we'll just log it
            }
            else {
              console.log(`No usable image data found in matching file for ${imgRef}`);
            }
          } else {
            console.log(`Could not find matching file for ${imgRef} in project files`);
          }
        }
      }
    } catch (error) {
      console.error('Error processing image references:', error);
      // Continue with compilation even if image processing fails
    }
    
    // Check if we have any modifiable LaTeX content
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
      
      console.log("Added graphicspath command to LaTeX content");
    }
    
    // Make sure graphicx package is included
    if (!processedLaTeX.includes('\\usepackage{graphicx}') && 
        !processedLaTeX.includes('\\usepackage[pdftex]{graphicx}')) {
      if (processedLaTeX.includes('\\documentclass')) {
        processedLaTeX = processedLaTeX.replace(
          /(\\documentclass.*?\})/,
          '$1\n\\usepackage[pdftex]{graphicx}'
        );
        console.log("Added graphicx package to LaTeX content");
      }
    }
    
    // Create HTML preview (used as fallback)
    const htmlPreview = createKatexHtmlPreview(processedLaTeX);
    
    try {
      console.log(`Sending request to LaTeX server with ${imagesToSend.length} images`);
      
      // Create request data with image information
      const requestData = {
        latex: processedLaTeX,
        format: 'pdf',
        images: imagesToSend
      };
      
      // Try to access the LaTeX server with the image data
      const serverResponse = await fetch('http://localhost:3001/render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
        cache: 'no-store'
      });
      
      // Handle the server response
      if (!serverResponse.ok) {
        const errorText = await serverResponse.text();
        console.error('LaTeX server error:', errorText);
        throw new Error('LaTeX server returned an error response');
      }
      
      const responseData = await serverResponse.json();
      console.log('LaTeX server response received');
      
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

// Function to extract image references from LaTeX content
function extractImageReferences(latex: string): string[] {
  // Regular expressions to match various image inclusion commands
  const patterns = [
    /\\includegraphics(?:\[.*?\])?\{([^{}]+)\}/g,      // Standard includegraphics
    /\\includesvg(?:\[.*?\])?\{([^{}]+)\}/g,           // includesvg if used
    /\\includestandalone(?:\[.*?\])?\{([^{}]+)\}/g,    // includestandalone if used
    /\\import\{([^{}]+)\}\{([^{}]+)\}/g,               // import command
    /\\input\{([^{}]+)\}/g                             // input command (might contain images)
  ];
  
  let matches: string[] = [];
  
  // Extract matches from each pattern
  patterns.forEach(pattern => {
    const patternMatches = [...latex.matchAll(pattern)];
    const extractedPaths = patternMatches.map(match => {
      // For import command, combine the path and filename
      if (pattern.toString().includes('\\\\import')) {
        return `${match[1]}/${match[2]}`;
      }
      return match[1];
    });
    matches = [...matches, ...extractedPaths];
  });
  
  // Process paths to handle extensions properly
  const processedMatches = matches.map(path => {
    // If no extension is provided, LaTeX will look for common image extensions
    if (!path.includes('.')) {
      return path; // Return as is, the compile function will try different extensions
    }
    return path;
  });
  
  // Return unique values
  return [...new Set(processedMatches)];
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
    
    // Handle images
    .replace(/\\includegraphics(?:\[([^\]]*)\])?\{([^}]+)\}/g, (match, options, file) => {
      const width = options?.match(/width=([^,}]+)/) ? options.match(/width=([^,}]+)/)[1] : '80%';
      return `<div class="my-4 text-center p-4 bg-gray-100 rounded"><div class="border-2 border-dashed border-gray-300 p-4 bg-white"><div class="text-gray-500 font-medium">Image: ${file}</div></div><div class="text-sm text-gray-500 mt-2">${file}</div></div>`;
    })
    
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