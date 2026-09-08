'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AppIcon } from '@/components/app-icon';
import { ThemeToggle } from '@/components/theme-toggle';

interface AppItem {
  id: number;
  name: string;
  slug: string;
  icon: string;
  url: string;
}

interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
}

export default function DashboardPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check authentication on client side
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) {
          router.push('/sign-in');
          return;
        }
        const data = await response.json();
        setUser(data.user);
        setApps(data.apps);
      } catch {
        router.push('/sign-in');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Session heartbeat: a request every 5 minutes while the tab is visible
  // counts as activity — the middleware slides the 30-minute token forward
  // — and detects an idle-expired session early (redirects on 401) instead
  // of waiting for the user's next click. Hidden tabs don't beat, so a
  // backgrounded dashboard still times out after 30 minutes.
  useEffect(() => {
    if (!user) return;
    const HEARTBEAT_MS = 5 * 60 * 1000;

    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) router.push('/sign-in');
      } catch {
        // Network blip — keep the session; the next tick retries.
      }
    };

    const timer = setInterval(check, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/sign-in');
    } catch {
      console.error('Logout failed');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-xl font-semibold">Dashboard</h1>
            <div className="flex items-center gap-3">
              {user && <span className="text-sm text-muted-foreground">{user.name}</span>}
              <ThemeToggle />
              <Button onClick={handleLogout} variant="outline">
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {apps.length === 0 && user?.role !== 'admin' ? (
            <div className="border rounded-lg bg-card">
              <div className="px-4 py-12 text-center text-muted-foreground">
                No applications yet — ask an admin to add some.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {apps.map((app) => (
                <a
                  key={app.id}
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-lg transition-shadow hover:shadow-md"
                >
                  <Card className="h-full p-6 group-hover:border-ring">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <AppIcon name={app.icon} className="h-8 w-8 text-muted-foreground group-hover:text-foreground" />
                      <span className="font-medium">{app.name}</span>
                    </div>
                  </Card>
                </a>
              ))}

              {user?.role === 'admin' && (
                <a
                  href="/admin"
                  className="group rounded-lg transition-shadow hover:shadow-md"
                >
                  <Card className="h-full p-6 border-primary/50 group-hover:border-primary">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <AppIcon name="shield" className="h-8 w-8 text-primary" />
                      <span className="font-medium">Admin</span>
                    </div>
                  </Card>
                </a>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
