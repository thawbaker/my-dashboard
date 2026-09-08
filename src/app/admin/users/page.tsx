'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { PasswordInput } from '@/components/ui/password-input';
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

type Role = 'user' | 'admin';

interface ManagedUser {
  id: number;
  email: string;
  username: string;
  name: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
  appCount: number;
  blockedAppIds: number[];
}

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

interface CreateForm {
  name: string;
  username: string;
  email: string;
  password: string;
  role: Role;
}

const emptyCreateForm: CreateForm = {
  name: '',
  username: '',
  email: '',
  password: '',
  role: 'user',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [apps, setApps] = useState<ManagedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggleBusyId, setToggleBusyId] = useState<number | null>(null);

  const [permsUser, setPermsUser] = useState<ManagedUser | null>(null);
  const [permsBlocked, setPermsBlocked] = useState<number[]>([]);
  const [permsSaving, setPermsSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ ...emptyCreateForm });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [usersRes, appsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/apps'),
      ]);
      if (!usersRes.ok || !appsRes.ok) {
        throw new Error('bad status');
      }
      const [usersData, appsData] = await Promise.all([
        usersRes.json(),
        appsRes.json(),
      ]);
      setUsers(usersData.users);
      setApps(appsData.apps);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (user: ManagedUser) => {
    const next = !user.disabled;
    const revert = () =>
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, disabled: !next } : u))
      );
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, disabled: next } : u))
    );
    setToggleBusyId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Failed to update user');
        revert();
        return;
      }
      toast.success(
        next
          ? `${user.name} disabled — live sessions are revoked`
          : `${user.name} enabled`
      );
    } catch {
      toast.error('Failed to update user');
      revert();
    } finally {
      setToggleBusyId(null);
    }
  };

  const openPerms = (user: ManagedUser) => {
    setPermsUser(user);
    setPermsBlocked(user.blockedAppIds ?? []);
  };

  const toggleAppAccess = (appId: number, checked: boolean) => {
    setPermsBlocked((prev) =>
      checked ? prev.filter((id) => id !== appId) : [...prev, appId]
    );
  };

  const savePerms = async () => {
    if (!permsUser) return;
    setPermsSaving(true);
    try {
      const res = await fetch(
        `/api/admin/users/${permsUser.id}/permissions`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockedAppIds: permsBlocked }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Failed to save permissions');
        return;
      }
      const data = await res.json();
      const savedBlocked: number[] = data.blockedAppIds ?? permsBlocked;
      // Role-aware: admins see every enabled app; users see enabled,
      // non-admin-only apps minus their denylist.
      const appCount =
        permsUser.role === 'admin'
          ? apps.filter((a) => a.enabled).length
          : apps.filter(
              (a) => a.enabled && !a.adminOnly && !savedBlocked.includes(a.id)
            ).length;
      setUsers((prev) =>
        prev.map((u) =>
          u.id === permsUser.id
            ? { ...u, blockedAppIds: savedBlocked, appCount }
            : u
        )
      );
      toast.success(`Permissions saved for ${permsUser.name}`);
      setPermsUser(null);
    } catch {
      toast.error('Failed to save permissions');
    } finally {
      setPermsSaving(false);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 400 && Array.isArray(data.errors)) {
          toast.error(
            data.errors.map((err: { message: string }) => err.message).join(' ')
          );
        } else {
          toast.error(data.error ?? 'Failed to create user');
        }
        return;
      }
      toast.success(`User ${data.user?.email ?? ''} created`);
      setCreateOpen(false);
      setCreateForm({ ...emptyCreateForm });
      await load();
    } catch {
      toast.error('Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const enabledApps = apps.filter((a) => a.enabled);

  if (loading) {
    return (
      <AdminShell title="User management">
        <div className="text-muted-foreground">Loading...</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="User management">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {users.length} user{users.length === 1 ? '' : 's'}
        </p>
        <Button onClick={() => setCreateOpen(true)}>Create user</Button>
      </div>

      <div className="border rounded-lg bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Apps</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground"
                >
                  No users yet.
                </TableCell>
              </TableRow>
            )}
            {users.map((user) => (
              <TableRow
                key={user.id}
                className={user.disabled ? 'opacity-50' : ''}
              >
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>
                  <code className="text-xs">{user.username}</code>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {user.email}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={user.role === 'admin' ? 'default' : 'secondary'}
                  >
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={!user.disabled}
                    disabled={toggleBusyId === user.id}
                    onCheckedChange={() => handleToggle(user)}
                    aria-label={`Toggle ${user.name}`}
                  />
                </TableCell>
                <TableCell>{user.appCount}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openPerms(user)}
                  >
                    Permissions
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={permsUser !== null}
        onOpenChange={(open) => {
          if (!open) setPermsUser(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permissions — {permsUser?.name}</DialogTitle>
            <DialogDescription>
              {permsUser?.role === 'admin'
                ? 'Admins can see and launch every enabled app — the per-user denylist does not apply to them.'
                : 'Checked apps are accessible; unchecked apps are blocked (denylist). Admin-only apps are always hidden from users.'}
            </DialogDescription>
          </DialogHeader>
          {enabledApps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No enabled apps yet — add some in App management.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {enabledApps.map((app) => {
                const isAdmin = permsUser?.role === 'admin';
                // Locked for two reasons: admins always have access
                // (denylist ignored); admin-only apps are denied to users by
                // role, so a denylist row would be dead data.
                const locked = isAdmin || app.adminOnly;
                const checked = isAdmin ? true : !permsBlocked.includes(app.id);
                return (
                  <label
                    key={app.id}
                    className={`flex items-center gap-2 text-sm ${
                      locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={locked}
                      onCheckedChange={(c) => toggleAppAccess(app.id, c === true)}
                    />
                    {app.name}
                    {app.adminOnly && <Badge variant="default">Admin only</Badge>}
                  </label>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermsUser(null)}>
              Cancel
            </Button>
            <Button onClick={savePerms} disabled={permsSaving}>
              {permsSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>
              Provision a new account. It starts with access to all enabled, non-admin-only apps.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-name">Name</Label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-username">Username</Label>
              <Input
                id="create-username"
                value={createForm.username}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, username: e.target.value }))
                }
                required
                placeholder="johndoe"
              />
              <p className="text-xs text-muted-foreground">
                2–32 characters: letters, numbers, dots, dashes, underscores.
                Becomes this user&apos;s personal data file name.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-password">Password</Label>
              <PasswordInput
                id="create-password"
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, password: e.target.value }))
                }
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <Select
                value={createForm.role}
                onValueChange={(role) =>
                  setCreateForm((f) => ({ ...f, role: role as Role }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
