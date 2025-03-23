import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Simple middleware that doesn't interfere with authentication
  return NextResponse.next();
}

// middleware.ts
export const config = {
  matcher: [
    // Skip checking API routes
    "/((?!_next/static|_next/image|favicon.ico|assets|api).*)",
  ],
};