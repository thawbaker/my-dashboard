'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin-shell';
import { AppIcon, APP_ICON_NAMES } from '@/components/app-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ManagedApp {
  id: number;
  name: string;
  slug: string;
  icon: string;
  url: string;
  enabled: boolean;
  adminOnly: boolean;
  createdAt: string;
}

interface AppForm {
  name: string;
  url: string;
  icon: string;
  adminOnly: boolean;
}

const emptyForm: AppForm = { name: '', url: '', icon: 'layout-grid', adminOnly: false };

export default function AdminAppsPage() {
  const [apps, setApps] = useState<ManagedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggleBusyId, setToggleBusyId] = useState<number | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<ManagedApp | null>(null);
  const [form, setForm] = useState<AppForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/apps');
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      setApps(data.apps);
    } catch {
      toast.error('Failed to load apps');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load);
    return () => clearTimeout(t);
  }, [load]);

  const handleToggle = async (app: ManagedApp) => {
    const next = !app.enabled;
    const revert = () =>
      setApps((prev) =>
        prev.map((a) => (a.id === app.id ? { ...a, enabled: !next } : a))
      );
    setApps((prev) =>
      prev.map((a) => (a.id === app.id ? { ...a, enabled: next } : a))
    );
    setToggleBusyId(app.id);
    try {
      const res = await fetch(`/api/admin/apps/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Failed to update app');
        revert();
        return;
      }
      toast.success(next ? `${app.name} enabled` : `${app.name} disabled`);
    } catch {
      toast.error('Failed to update app');
      revert();
    } finally {
      setToggleBusyId(null);
    }
  };

  const openCreate = () => {
    setEditingApp(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (app: ManagedApp) => {
    setEditingApp(app);
    setForm({ name: app.name, url: app.url, icon: app.icon, adminOnly: app.adminOnly });
    setDialogOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        url: form.url.trim() || '#',
        icon: form.icon,
        adminOnly: form.adminOnly,
      };
      const res = await fetch(
        editingApp ? `/api/admin/apps/${editingApp.id}` : '/api/admin/apps',
        {
          method: editingApp ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 400 && Array.isArray(data.errors)) {
          toast.error(
            data.errors.map((err: { message: string }) => err.message).join(' ')
          );
        } else {
          toast.error(data.error ?? 'Failed to save app');
        }
        return;
      }
      toast.success(
        editingApp
          ? 'App updated'
          : form.adminOnly
            ? 'App created — visible to admins only'
            : 'App created — available to all users'
      );
      setDialogOpen(false);
      await load();
    } catch {
      toast.error('Failed to save app');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminShell title="App management">
        <div className="text-muted-foreground">Loading...</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="App management">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {apps.length} app{apps.length === 1 ? '' : 's'} — apps are
          available to every user unless marked “Admin only”
        </p>
        <Button onClick={openCreate}>Add app</Button>
      </div>

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>App</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apps.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  No apps yet — add the first one.
                </TableCell>
              </TableRow>
            )}
            {apps.map((app) => (
              <TableRow key={app.id} className={app.enabled ? '' : 'opacity-50'}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <AppIcon
                      name={app.icon}
                      className="h-4 w-4 text-muted-foreground"
                    />
                    <span className="font-medium">{app.name}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {app.slug}
                </TableCell>
                <TableCell className="max-w-64">
                  <span className="block truncate text-muted-foreground">
                    {app.url}
                  </span>
                </TableCell>
                <TableCell>
                  {app.adminOnly ? (
                    <Badge variant="default" title="Only admins can see and launch this app">
                      Admin only
                    </Badge>
                  ) : (
                    <Badge variant="secondary">All users</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={app.enabled}
                    disabled={toggleBusyId === app.id}
                    onCheckedChange={() => handleToggle(app)}
                    aria-label={`Toggle ${app.name}`}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(app)}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setDialogOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingApp ? `Edit app — ${editingApp.name}` : 'Add app'}
            </DialogTitle>
            <DialogDescription>
              {editingApp
                ? 'Changes apply immediately. Renaming recomputes the slug.'
                : 'New apps are granted to every user automatically (denylist model) unless marked admin-only.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="app-name">Name</Label>
              <Input
                id="app-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="app-url">URL</Label>
              <Input
                id="app-url"
                placeholder="https://… (leave blank for '#')"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Icon</Label>
              <Select
                value={form.icon}
                onValueChange={(icon) => setForm((f) => ({ ...f, icon }))}
              >
                <SelectTrigger>
                  <span className="flex items-center gap-2">
                    <AppIcon name={form.icon} className="h-4 w-4" />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {APP_ICON_NAMES.map((name) => (
                    <SelectItem key={name} value={name}>
                      <span className="flex items-center gap-2">
                        <AppIcon name={name} className="h-4 w-4" />
                        <span>{name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex flex-col gap-0.5">
                <Label>Admin only</Label>
                <p className="text-xs text-muted-foreground">
                  Hide this app from every non-admin user. Admins can always
                  see and launch it.
                </p>
              </div>
              <Switch
                checked={form.adminOnly}
                onCheckedChange={(adminOnly) =>
                  setForm((f) => ({ ...f, adminOnly }))
                }
                aria-label="Admin only"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? 'Saving…'
                  : editingApp
                    ? 'Save'
                    : 'Add app'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
