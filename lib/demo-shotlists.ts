import type { ShotListItem } from "@/types/shotlist";

export const demoShotListItems: ShotListItem[] = [
  {
    id: "shot-demo-1",
    shootingRow: 4,
    athlete: "Loan Cueto",
    sport: "Tennis",
    shootingTitle: "Portrait Premium",
    category: "Portrait",
    title: "Portrait vertical",
    priority: "Haute",
    done: false,
    notes: "",
    order: 1,
  },
  {
    id: "shot-demo-2",
    shootingRow: 4,
    athlete: "Loan Cueto",
    sport: "Tennis",
    shootingTitle: "Portrait Premium",
    category: "Réseaux sociaux",
    title: "Story verticale",
    priority: "Moyenne",
    done: true,
    notes: "Format 9:16",
    order: 2,
  },
];
