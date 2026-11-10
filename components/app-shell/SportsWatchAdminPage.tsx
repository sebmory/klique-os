"use client";

import { useEffect, useState } from "react";
import { SportsWatchAdminCard } from "@/components/app-shell/SportsWatchAdminCard";
import type { AthletesResponse } from "@/types/athlete";

export function SportsWatchAdminPage() {
  const [athletes, setAthletes] = useState<AthletesResponse["athletes"]>([]);
  const [directoryStatus, setDirectoryStatus] = useState<"loading" | "ready" | "error">("loading");

  const retryAthletes = async () => {
    setDirectoryStatus("loading");
    try {
      const response = await fetch("/api/athletes?weeklyResponseDays=14&monthlyResponseDays=45", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Annuaire indisponible");
      const payload = await response.json() as AthletesResponse;
      setAthletes(Array.isArray(payload.athletes) ? payload.athletes : []);
      setDirectoryStatus("ready");
    } catch {
      setDirectoryStatus("error");
    }
  };

  useEffect(() => {
    let active = true;
    void fetch("/api/athletes?weeklyResponseDays=14&monthlyResponseDays=45", {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Annuaire indisponible");
        return response.json() as Promise<AthletesResponse>;
      })
      .then((payload) => {
        if (!active) return;
        setAthletes(Array.isArray(payload.athletes) ? payload.athletes : []);
        setDirectoryStatus("ready");
      })
      .catch(() => {
        if (active) setDirectoryStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="sports-watch-admin-page">
      <header>
        <p>Administration</p>
        <h1>Sports Watch</h1>
      </header>
      {directoryStatus === "error" ? (
        <div className="sports-watch-directory-error" role="alert">
          <span>
            L’annuaire Athlètes n’a pas pu être chargé. Sports Watch reste accessible,
            mais certaines sélections peuvent être indisponibles.
          </span>
          <button type="button" onClick={() => void retryAthletes()}>Réessayer</button>
        </div>
      ) : null}
      <SportsWatchAdminCard athletes={athletes} />
    </main>
  );
}
