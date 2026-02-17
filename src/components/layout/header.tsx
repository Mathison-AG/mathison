"use client";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, User, Settings, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

const pageLabels: Record<string, string> = {
  "/": "App Store",
  "/catalog": "App Store",
  "/apps": "My Apps",
  "/deployments": "My Apps",
  "/settings": "Settings",
};

interface HeaderProps {
  workspaceName?: string;
  userName?: string | null;
  userEmail?: string | null;
  onMobileMenuToggle?: () => void;
}

export function Header({
  workspaceName,
  userName,
  userEmail,
  onMobileMenuToggle,
}: HeaderProps) {
  const pathname = usePathname();

  const pageTitle =
    Object.entries(pageLabels).find(
      ([path]) =>
        path === "/" ? pathname === "/" : pathname.startsWith(path)
    )?.[1] ?? "Dashboard";

  const initials = userName
    ? userName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : userEmail?.[0]?.toUpperCase() ?? "U";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMobileMenuToggle}
      >
        <Menu className="size-5" />
        <span className="sr-only">Toggle menu</span>
      </Button>

      {/* Page title */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{pageTitle}</h1>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Workspace badge */}
        {workspaceName && (
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {workspaceName}
          </Badge>
        )}

        <Separator orientation="vertical" className="h-6" />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative size-8 rounded-full">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{userName ?? "User"}</p>
              <p className="text-xs text-muted-foreground">{userEmail}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/settings" className="cursor-pointer">
                <User className="mr-2 size-4" />
                Profile
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/settings" className="cursor-pointer">
                <Settings className="mr-2 size-4" />
                Settings
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="mr-2 size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
