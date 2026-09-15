"use client";

import { use } from "react";
import { MediaAthleteProfileScreen } from "@/components/media/MediaAthleteProfileScreen";

export default function MediaAthleteProfilePage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = use(params);
  return <MediaAthleteProfileScreen athleteId={athleteId} />;
}