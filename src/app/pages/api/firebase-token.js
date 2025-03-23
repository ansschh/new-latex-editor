// pages/api/firebase-token.js
import { NextResponse } from "next/server";
import { auth } from "firebase-admin";
import { getAuth } from "@clerk/nextjs/server";
import { initAdmin } from "@/lib/firebase-admin";

// Initialize Firebase Admin if it hasn't been initialized yet
initAdmin();

export async function POST(request) {
  try {
    const { userId } = await request.json();
    const auth = getAuth(request);
    
    // Verify the user is authenticated with Clerk
    if (!auth?.userId || auth.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Create a custom token for this user
    const token = await auth.createCustomToken(userId);
    
    return NextResponse.json({ token });
  } catch (error) {
    console.error("Error creating Firebase token:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}