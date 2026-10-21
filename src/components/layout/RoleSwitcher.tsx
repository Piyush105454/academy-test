import { useUserRole, ROLE_NAMES, ROLE_COLORS } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Users, ChevronDown, Check, Shield, ShieldCheck, UserCheck, GraduationCap, BookOpen, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLE_ICONS: Record<number, any> = {
  1: Shield,
  2: ShieldCheck,
  3: UserCheck,
  4: GraduationCap,
  5: BookOpen,
};

// Flag to easily toggle role switch buttons visibility without removing any code
const SHOW_ROLE_SWITCHER = false;

export function RoleSwitcher({ variant = 'header' }: { variant?: 'header' | 'sidebar' | 'profile-menu' }) {
  if (!SHOW_ROLE_SWITCHER) {
    return null;
  }

  const { userRole, availableRoles, isMultiRole, switchRole, isLoading } = useUserRole();

  if (isLoading || !userRole) {
    return null;
  }

  const ActiveIcon = ROLE_ICONS[userRole] || Users;
  const activeColor = ROLE_COLORS[userRole] || { bg: 'bg-muted', text: 'text-foreground', border: 'border-border' };
  const otherRoles = availableRoles.filter(r => r !== userRole);

  // Variant 1: Header Dropdown / Badge
  if (variant === 'header') {
    if (!isMultiRole) {
      return (
        <div className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-xs",
          activeColor.bg,
          activeColor.text,
          activeColor.border
        )}>
          <ActiveIcon className="h-3.5 w-3.5" />
          <span>{ROLE_NAMES[userRole] || 'Role'}</span>
        </div>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-xs font-semibold px-2.5 border rounded-full transition-all hover:opacity-90 shadow-xs",
              activeColor.bg,
              activeColor.text,
              activeColor.border
            )}
          >
            <ActiveIcon className="h-3.5 w-3.5" />
            <span className="truncate max-w-[90px] sm:max-w-none">{ROLE_NAMES[userRole] || 'Role'}</span>
            <ArrowLeftRight className="h-3 w-3 opacity-60 ml-0.5" />
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 p-1 text-xs">
          <DropdownMenuLabel className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
            Active Role
          </DropdownMenuLabel>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent/40 font-semibold mb-1">
            <ActiveIcon className="h-4 w-4 text-primary" />
            <span className="flex-1">{ROLE_NAMES[userRole]}</span>
            <Check className="h-3.5 w-3.5 text-primary" />
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1">
            Switch Role ({otherRoles.length})
          </DropdownMenuLabel>

          {otherRoles.map(roleId => {
            const Icon = ROLE_ICONS[roleId] || Users;
            return (
              <DropdownMenuItem
                key={roleId}
                onClick={() => switchRole(roleId)}
                className="gap-2.5 cursor-pointer py-2 px-2 font-medium hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <div className="h-6 w-6 rounded-md bg-muted/80 flex items-center justify-center">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex flex-col">
                  <span>Switch to {ROLE_NAMES[roleId] || 'Unknown'}</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    {roleId === 3 ? 'Coordinator view & tools' : roleId === 4 ? 'Facilitator tasks & prep' : 'Switch portal'}
                  </span>
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Variant 2: Sidebar
  if (variant === 'sidebar') {
    if (!isMultiRole) return null;

    return (
      <div className="p-3 md:p-4 border-t border-border space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-muted-foreground">Active Role</span>
          <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", activeColor.bg, activeColor.text, activeColor.border)}>
            {ROLE_NAMES[userRole]}
          </Badge>
        </div>

        <div className="text-[11px] font-medium text-muted-foreground px-1">Switch to:</div>
        <div className="space-y-1">
          {otherRoles.map(roleId => {
            const Icon = ROLE_ICONS[roleId] || Users;
            return (
              <button
                key={roleId}
                onClick={() => switchRole(roleId)}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg transition-colors text-xs font-medium text-foreground bg-muted/40 hover:bg-primary/10 hover:text-primary border border-border/60"
              >
                <Icon className="h-4 w-4 flex-shrink-0 text-blue-500" />
                <span className="truncate">Switch to {ROLE_NAMES[roleId] || 'Unknown'}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Variant 3: Profile Menu Items
  if (variant === 'profile-menu') {
    if (!isMultiRole) return null;

    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider px-2 py-1">
          Switch Role
        </DropdownMenuLabel>
        {otherRoles.map(roleId => {
          const Icon = ROLE_ICONS[roleId] || Users;
          return (
            <DropdownMenuItem
              key={roleId}
              onClick={() => switchRole(roleId)}
              className="gap-2 cursor-pointer text-xs font-medium text-primary hover:bg-primary/10"
            >
              <Icon className="h-3.5 w-3.5" />
              <span>Switch to {ROLE_NAMES[roleId]}</span>
            </DropdownMenuItem>
          );
        })}
      </>
    );
  }

  return null;
}
