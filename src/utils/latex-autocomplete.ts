// utils/latex-autocomplete.ts

import { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';

// Common LaTeX commands
export const latexCommands: { [key: string]: string } = {
  // Document structure
  "\\documentclass": "\\documentclass{article}",
  "\\title": "\\title{Your Title}",
  "\\author": "\\author{Author Name}",
  "\\date": "\\date{\\today}",
  "\\maketitle": "\\maketitle",
  "\\begin{document}": "\\begin{document}",
  "\\end{document}": "\\end{document}",
  "\\tableofcontents": "\\tableofcontents",
  
  // Sections
  "\\section": "\\section{Section Name}",
  "\\subsection": "\\subsection{Subsection Name}",
  "\\subsubsection": "\\subsubsection{Subsubsection Name}",
  "\\paragraph": "\\paragraph{Paragraph Title}",
  "\\appendix": "\\appendix",
  
  // Formatting
  "\\textbf": "\\textbf{bold text}",
  "\\textit": "\\textit{italic text}",
  "\\underline": "\\underline{underlined text}",
  "\\emph": "\\emph{emphasized text}",
  "\\texttt": "\\texttt{monospace text}",
  "\\textsc": "\\textsc{small caps text}",
  "\\textsf": "\\textsf{sans-serif text}",
  "\\textrm": "\\textrm{roman text}",
  "\\footnote": "\\footnote{footnote text}",
  
  // Lists
  "\\begin{itemize}": "\\begin{itemize}\n  \\item First item\n  \\item Second item\n\\end{itemize}",
  "\\begin{enumerate}": "\\begin{enumerate}\n  \\item First item\n  \\item Second item\n\\end{enumerate}",
  "\\begin{description}": "\\begin{description}\n  \\item[Term] Description\n  \\item[Another] Another description\n\\end{description}",
  "\\item": "\\item ",
  
  // Math
  "\\begin{equation}": "\\begin{equation}\n  E = mc^2\n\\end{equation}",
  "\\begin{align}": "\\begin{align}\n  a &= b + c \\\\\n  &= d + e\n\\end{align}",
  "\\begin{array}": "\\begin{array}{ccc}\n  a & b & c \\\\\n  d & e & f\n\\end{array}",
  "\\frac": "\\frac{numerator}{denominator}",
  "\\sqrt": "\\sqrt{expression}",
  "\\sum": "\\sum_{i=1}^{n} i",
  "\\int": "\\int_{a}^{b} f(x) \\, dx",
  "\\lim": "\\lim_{x \\to \\infty} f(x)",
  
  // Tables
  "\\begin{table}": "\\begin{table}[h]\n  \\centering\n  \\caption{Table caption}\n  \\label{tab:label}\n  \\begin{tabular}{cc}\n    \\hline\n    Header 1 & Header 2 \\\\\n    \\hline\n    Cell 1 & Cell 2 \\\\\n    Cell 3 & Cell 4 \\\\\n    \\hline\n  \\end{tabular}\n\\end{table}",
  "\\begin{tabular}": "\\begin{tabular}{cc}\n  Header 1 & Header 2 \\\\\n  \\hline\n  Cell 1 & Cell 2 \\\\\n  Cell 3 & Cell 4\n\\end{tabular}",
  
  // Figures
  "\\begin{figure}": "\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{filename}\n  \\caption{Figure caption}\n  \\label{fig:label}\n\\end{figure}",
  "\\includegraphics": "\\includegraphics[width=0.8\\textwidth]{filename}",
  
  // Citations and references
  "\\cite": "\\cite{reference}",
  "\\ref": "\\ref{label}",
  "\\label": "\\label{name}",
  "\\bibliography": "\\bibliography{bibfile}",
  "\\bibliographystyle": "\\bibliographystyle{plain}",
  
  // Common packages
  "\\usepackage{amsmath}": "\\usepackage{amsmath}",
  "\\usepackage{graphicx}": "\\usepackage{graphicx}",
  "\\usepackage{hyperref}": "\\usepackage{hyperref}",
  "\\usepackage{booktabs}": "\\usepackage{booktabs}",
  "\\usepackage{natbib}": "\\usepackage{natbib}",
  "\\usepackage{multicol}": "\\usepackage{multicol}",
};

// Environment-specific completions
export const environmentCompletions: { [key: string]: string[] } = {
  "itemize": ["\\item "],
  "enumerate": ["\\item "],
  "description": ["\\item[Term] Description"],
  "equation": [""],
  "align": ["", "& = ", "\\\\ "],
  "tabular": ["& ", "\\\\ ", "\\hline "],
  "table": ["\\caption{}", "\\label{tab:}"],
  "figure": ["\\includegraphics[width=0.8\\textwidth]{}", "\\caption{}", "\\label{fig:}"],
};

// Get completions based on current context
export function getLatexCompletions(context: CompletionContext): CompletionResult | null {
  // Get the text before the cursor
  const { state, pos } = context;
  const line = state.doc.lineAt(pos);
  const textBefore = line.text.slice(0, pos - line.from);

  // Check if we're typing a command (starts with \)
  const commandMatch = textBefore.match(/\\([a-zA-Z]*)$/);
  if (commandMatch) {
    const prefix = commandMatch[1];
    
    // Filter commands that match the prefix
    const matchingCommands = Object.entries(latexCommands)
      .filter(([cmd]) => cmd.startsWith('\\' + prefix))
      .map(([cmd, template]): Completion => ({
        label: cmd,
        apply: template,
        detail: template.split('\n')[0] + (template.includes('\n') ? '...' : ''),
        boost: cmd === '\\' + prefix ? 100 : undefined,
      }));
    
    if (matchingCommands.length > 0) {
      return {
        from: pos - prefix.length - 1, // -1 for the backslash
        options: matchingCommands,
      };
    }
  }
  
  // Check if we're inside an environment (after \begin{...})
  const envMatch = textBefore.match(/\\begin\{([a-zA-Z]+)\}.*$/);
  if (envMatch) {
    const envName = envMatch[1];
    
    if (environmentCompletions[envName]) {
      return {
        from: pos,
        options: environmentCompletions[envName].map(template => ({
          label: template || '[' + envName + ' content]',
          apply: template,
        })),
      };
    }
  }
  
  return null;
}

// Export a function that creates the completion source
export function latexCompletions() {
  return getLatexCompletions;
}