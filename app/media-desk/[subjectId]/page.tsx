"use client";

import { use } from "react";
import { MediaSubjectDetailScreen } from "@/components/media-desk/MediaSubjectDetailScreen";

export default function MediaSubjectPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = use(params);

  return <MediaSubjectDetailScreen subjectId={subjectId} />;
}
