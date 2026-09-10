"use client";

import { useCallback, useEffect, useState } from "react";
import { MediaCenterModule } from "@/components/media/MediaCenterModule";
import { MediaService } from "@/services/media.service";
import type { Athlete } from "@/types/athlete";
import type { MediaLot } from "@/types/media";

export default function MediaPage() {
  const [media, setMedia] = useState<MediaLot[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [source, setSource] = useState<"google-sheets" | "demo">("google-sheets");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMedia = useCallback(async () => {
    const response = await MediaService.list();
    setMedia(response.media);
    setSource(response.source);
    setMessage(response.message ?? "");
  }, []);

  useEffect(() => {
    let active = true;

    const loadAll = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        await loadMedia();
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Banque médias indisponible.");
      }

      try {
        const response = await fetch("/api/athletes", { credentials: "include", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { athletes?: Athlete[] } | null;
        if (active && Array.isArray(payload?.athletes)) {
          setAthletes(
            payload.athletes
              .filter((athlete) => athlete.key && athlete.name)
              .sort((a, b) => a.name.localeCompare(b.name, "fr")),
          );
        }
      } catch {
        if (active) setAthletes([]);
      }

      if (active) setLoading(false);
    };

    void loadAll();
    return () => {
      active = false;
    };
  }, [loadMedia]);

  if (loading) {
    return <p style={{ margin: 0, color: "#6b7280" }}>Chargement de la banque médias…</p>;
  }

  return (
    <>
      {errorMessage ? (
        <p role="alert" style={{ margin: "0 0 1rem", color: "#b91c1c" }}>
          {errorMessage}
        </p>
      ) : null}

      <MediaCenterModule
        athletes={athletes}
        media={media}
        source={source}
        message={message}
        onRefresh={loadMedia}
      />
    </>
  );
}
