'use client';

import { LayoutGrid, ScrollText, Settings, Users, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { AdminShell } from '@/components/admin-shell';

interface AdminFunction {
  icon: LucideIcon;
  label: string;
  href?: string;
}

const FUNCTIONS: AdminFunction[] = [
  { icon: Users, label: 'User management', href: '/admin/users' },
  { icon: LayoutGrid, label: 'App management', href: '/admin/apps' },
  { icon: Settings, label: 'Settings' },
  { icon: ScrollText, label: 'Audit log' },
];

export default function AdminPage() {
  const router = useRouter();

  const handleClick = (fn: AdminFunction) => {
    if (fn.href) {
      router.push(fn.href);
    } else {
      toast('Coming soon');
    }
  };

  return (
    <AdminShell title="Admin">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {FUNCTIONS.map(({ icon: Icon, label, href }) => (
          <button
            key={label}
            type="button"
            onClick={() => handleClick({ icon: Icon, label, href })}
            className="group rounded-lg transition-shadow hover:shadow-md text-left"
          >
            <Card className="h-full p-6 group-hover:border-ring">
              <div className="flex flex-col items-center gap-3 text-center">
                <Icon className="h-8 w-8 text-muted-foreground group-hover:text-foreground" />
                <span className="font-medium">{label}</span>
              </div>
            </Card>
          </button>
        ))}
      </div>
    </AdminShell>
  );
}
