import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full space-y-8">
        <AppHeader />

        <div className="space-y-4">
          <Button asChild className="w-full">
            <Link href="/sign-in">
              Sign In
            </Link>
          </Button>
          
          <Button asChild variant="outline" className="w-full">
            <Link href="/sign-up">
              Create Account
            </Link>
          </Button>
          
          <Button asChild variant="secondary" className="w-full">
            <Link href="/dashboard">
              Go to Dashboard (Protected)
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}