"use client";

import type { ComponentType } from "react";

import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  Clapperboard,
  ChevronDown,
  ChevronsUpDown,
  CircleUserRound,
  FolderKanban,
  Globe2,
  House,
  Image,
  PenSquare,
  LayoutGrid,
  Menu,
  MessageSquareText,
  Plug,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";

export type IconName =
  | "house"
  | "users"
  | "folder"
  | "network"
  | "contents"
  | "production"
  | "image"
  | "sparkles"
  | "messages"
  | "calendar"
  | "chart"
  | "plug"
  | "settings";

export const iconByName: Record<IconName, ComponentType<{ className?: string }>> = {
  house: House,
  users: Users,
  folder: FolderKanban,
  network: Globe2,
  contents: PenSquare,
  production: Clapperboard,
  image: Image,
  sparkles: Sparkles,
  messages: MessageSquareText,
  calendar: CalendarDays,
  chart: ChartNoAxesCombined,
  plug: Plug,
  settings: Settings,
};

export {
  Bell,
  ChevronDown,
  ChevronsUpDown,
  CircleUserRound,
  LayoutGrid,
  Menu,
  Search,
  X,
};
