"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";

export default function LandingPage() {
  const { user } = useUser();

  return (
    <main className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-4xl font-bold">Welcome to LaTeX Scholar</h1>
      {!user && (
        <p className="mt-4">
          <Link href="/sign-in" className="text-teal-600 underline">
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/sign-up" className="text-teal-600 underline">
            Sign up
          </Link>
        </p>
      )}
      {user && (
        <p className="mt-4">
          You’re signed in. Go to your{" "}
          <Link href="/dashboard" className="text-teal-600 underline">
            dashboard
          </Link>.
        </p>
      )}
    </main>
  );
}
