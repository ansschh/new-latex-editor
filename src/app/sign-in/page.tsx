import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="py-4 px-6 border-b border-gray-800">
        <div className="container mx-auto">
          <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">
            LaTeX Scholar
          </Link>
        </div>
      </header>
      
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">Welcome back</h1>
            <p className="text-gray-400">Sign in to continue to your scientific writing</p>
          </div>
          <div className="bg-gray-800/60 backdrop-blur-sm rounded-lg shadow-xl p-8 border border-gray-700/50">
            <SignIn 
              routing="path" 
              path="/sign-in" 
              signUpUrl="/sign-up"
              redirectUrl="/editor"
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "bg-transparent shadow-none",
                  cardContent: "gap-6",
                  headerTitle: "text-white text-xl font-bold",
                  headerSubtitle: "text-gray-400",
                  formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md transition-colors duration-200 w-full",
                  formFieldLabel: "text-gray-300 font-medium",
                  formFieldInput: "bg-gray-700/70 border-gray-600 text-white rounded-md py-2.5 px-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200",
                  footerActionLink: "text-blue-400 hover:text-blue-300 font-medium",
                  dividerLine: "bg-gray-700/70",
                  dividerText: "text-gray-500 bg-gray-800/90 px-2",
                  socialButtonsBlockButton: "border border-gray-700 bg-gray-800/90 hover:bg-gray-700 hover:border-gray-600 text-white rounded-md py-2.5 transition-colors duration-200",
                  socialButtonsProviderIcon: "w-5 h-5",
                  formFieldAction: "text-blue-400 hover:text-blue-300",
                  otpCodeFieldInput: "bg-gray-700 border-gray-600 text-white rounded",
                  alertText: "text-white",
                  identityPreviewEditButton: "text-blue-400 hover:text-blue-300",
                }
              }}
            />
          </div>
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>LaTeX Scholar - AI-powered scientific writing assistant</p>
          </div>
        </div>
      </div>
    </div>
  );
}