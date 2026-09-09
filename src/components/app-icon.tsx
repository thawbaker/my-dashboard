import {
  BarChart3,
  Bell,
  Calendar,
  Cloud,
  Code,
  Database,
  FileText,
  Folder,
  Globe,
  Image,
  Kanban,
  Layers,
  LayoutGrid,
  Lock,
  Mail,
  MessageSquare,
  Settings,
  Shield,
  Star,
  Terminal,
  Users,
  type LucideIcon,
} from 'lucide-react';

// Fixed icon set (name -> component). Apps store the icon *name*;
// anything unknown falls back to LayoutGrid.
const ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  'bar-chart-3': BarChart3,
  'file-text': FileText,
  globe: Globe,
  'message-square': MessageSquare,
  calendar: Calendar,
  database: Database,
  lock: Lock,
  mail: Mail,
  settings: Settings,
  users: Users,
  'layout-grid': LayoutGrid,
  terminal: Terminal,
  cloud: Cloud,
  shield: Shield,
  star: Star,
  bell: Bell,
  layers: Layers,
  image: Image,
  code: Code,
  kanban: Kanban,
};

/** Ordered list of available icon names (admin app picker). */
export const APP_ICON_NAMES = [
  'folder',
  'bar-chart-3',
  'file-text',
  'globe',
  'message-square',
  'calendar',
  'database',
  'lock',
  'mail',
  'settings',
  'users',
  'layout-grid',
  'terminal',
  'cloud',
  'shield',
  'star',
  'bell',
  'layers',
  'image',
  'code',
  'kanban',
] as const;

export function AppIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? LayoutGrid;
  return <Icon className={className} />;
}
