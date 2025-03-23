// components/NewProjectModal.tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { authenticateWithFirebase } from "@/lib/firebase-auth";

interface NewProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string | null;
}

export default function NewProjectModal({ isOpen, onClose, userId }: NewProjectModalProps) {
    const router = useRouter();
    const [projectName, setProjectName] = useState("Untitled Project");
    const [projectType, setProjectType] = useState("article");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const templates = [
        { id: "article", name: "Article", description: "Standard LaTeX article" },
        { id: "report", name: "Report", description: "Longer document with chapters" },
        { id: "thesis", name: "Thesis", description: "Academic thesis structure" },
        { id: "presentation", name: "Presentation", description: "Beamer presentation slides" },
    ];

    const handleCreateProject = async () => {
        if (!userId) {
            setError("You must be logged in to create a project");
            return;
        }

        if (!projectName.trim()) {
            setError("Project name cannot be empty");
            return;
        }

        setLoading(true);
        setError("");

        try {
            // First authenticate with Firebase
            const fbUser = await authenticateWithFirebase(userId);
            console.log("Authenticated with Firebase, creating project");

            // Get template content based on project type
            const templateContent = getTemplateContent(projectType);

            const docRef = await addDoc(collection(db, "projects"), {
                title: projectName,
                owner: userId, // Use Clerk ID consistently
                createdAt: serverTimestamp(),
                lastModified: serverTimestamp(),
                content: templateContent,
                tags: [],
                type: projectType,
                collaborators: [],
                isPublic: false,
            });

            console.log("Project created successfully:", docRef.id);

            // Navigate to the editor
            router.push(`/editor/${docRef.id}`);
        } catch (error: any) {
            console.error("Error creating new project:", error);
            setError(`Failed to create project: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // Function to get template content based on selected type
    const getTemplateContent = (type: string): string => {
        switch (type) {
            case "article":
                return `\\documentclass{article}
\\title{${projectName}}
\\author{Your Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Your introduction goes here.

\\section{Method}
Your method goes here.

\\section{Results}
Your results go here.

\\section{Discussion}
Your discussion goes here.

\\section{Conclusion}
Your conclusion goes here.

\\end{document}`;
            case "report":
                // Report template content
                return `\\documentclass{report}
\\title{${projectName}}
\\author{Your Name}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

\\chapter{Introduction}
Your introduction goes here.

\\chapter{Literature Review}
Your literature review goes here.

\\chapter{Method}
Your method goes here.

\\chapter{Results}
Your results go here.

\\chapter{Discussion}
Your discussion goes here.

\\chapter{Conclusion}
Your conclusion goes here.

\\end{document}`;
            case "thesis":
                // Thesis template content
                return `\\documentclass[12pt, oneside]{book}
\\usepackage{amsmath, amssymb, graphicx, hyperref}
\\title{${projectName}}
\\author{Your Name}
\\date{\\today}

\\begin{document}
\\frontmatter
\\maketitle
\\tableofcontents

\\chapter*{Abstract}
Your abstract goes here.

\\mainmatter
\\chapter{Introduction}
Your introduction goes here.

\\chapter{Literature Review}
Your literature review goes here.

\\chapter{Methodology}
Your methodology goes here.

\\chapter{Results}
Your results go here.

\\chapter{Discussion}
Your discussion goes here.

\\chapter{Conclusion}
Your conclusion goes here.

\\backmatter
\\bibliographystyle{plain}
\\bibliography{references}
\\appendix

\\end{document}`;
            case "presentation":
                // Presentation template content
                return `\\documentclass{beamer}
\\usetheme{Madrid}
\\title{${projectName}}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\frame{\\titlepage}

\\begin{frame}
\\frametitle{Outline}
\\tableofcontents
\\end{frame}

\\section{Introduction}
\\begin{frame}
\\frametitle{Introduction}
Your introduction goes here.
\\end{frame}

\\section{Methods}
\\begin{frame}
\\frametitle{Methods}
Your methods go here.
\\end{frame}

\\section{Results}
\\begin{frame}
\\frametitle{Results}
Your results go here.
\\end{frame}

\\section{Conclusion}
\\begin{frame}
\\frametitle{Conclusion}
Your conclusion goes here.
\\end{frame}

\\end{document}`;
            default:
                return `\\documentclass{article}
\\title{${projectName}}
\\author{Your Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Start writing here.

\\end{document}`;
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-full max-w-md p-6 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">Create New Project</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="mb-4">
                    <label htmlFor="projectName" className="block text-sm font-medium text-gray-800 mb-1">
                        Project Name
                    </label>
                    <input
                        type="text"
                        id="projectName"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder="Enter project name"
                        autoFocus
                    />
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-800 mb-2">
                        Template
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        {templates.map((template) => (
                            <div
                                key={template.id}
                                onClick={() => setProjectType(template.id)}
                                className={`border rounded-md p-3 cursor-pointer transition-colors ${
                                    projectType === template.id 
                                        ? 'border-teal-500 bg-teal-50' 
                                        : 'border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                <div className="font-medium text-gray-800">{template.name}</div>
                                <div className="text-xs text-gray-600 mt-1">{template.description}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {error && (
                    <div className="mb-4 text-sm text-red-600">
                        {error}
                    </div>
                )}

                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreateProject}
                        disabled={loading}
                        className={`px-4 py-2 text-sm bg-teal-600 text-white rounded-md ${
                            loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-teal-700'
                        }`}
                    >
                        {loading ? 'Creating...' : 'Create Project'}
                    </button>
                </div>
            </div>
        </div>
    );
}