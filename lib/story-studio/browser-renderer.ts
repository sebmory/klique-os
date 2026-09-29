import type {
  StoryStudioBrandKitSnapshot,
  StoryStudioFrame,
  StoryStudioLogoLayout,
  StoryStudioTextBlock,
  StoryStudioTextPosition,
} from "@/types/story-studio";
import type { StoryStudioTemplateDefinition } from "@/lib/story-studio/templates";

export type StoryStudioBrowserRenderErrorCode =
  | "CANVAS_UNAVAILABLE"
  | "PHOTO_UNAVAILABLE"
  | "PHOTO_CORS"
  | "FONT_LOAD_FAILED"
  | "HEADLINE_OVERFLOW"
  | "EXPORT_FAILED";

export class StoryStudioBrowserRenderError extends Error {
  constructor(
    public readonly code: StoryStudioBrowserRenderErrorCode,
    message: string
  ) {
    super(message);
    this.name = "StoryStudioBrowserRenderError";
  }
}

export type RenderStoryStudioFrameInput = {
  canvas: HTMLCanvasElement;
  frame: StoryStudioFrame;
  template: StoryStudioTemplateDefinition;
  photoUrl: string | null;
  brandKitSnapshot?: StoryStudioBrandKitSnapshot | null;
  onTextBounds?: (bounds: StoryStudioTextBounds) => void;
  onLogoBounds?: (bounds: StoryStudioLogoBounds) => void;
  onDiagnostics?: (diagnostics: StoryStudioRenderDiagnostics) => void;
};

export type StoryStudioRenderDiagnostics = {
  headlineFontSize: number;
  headlineOverflow: boolean;
  stickerZone: StoryStudioTemplateDefinition["composition"]["interaction"] | null;
};

export type StoryStudioTextBound = {
  x: number;
  y: number;
  width: number;
  height: number;
  position: StoryStudioTextPosition;
};

export type StoryStudioTextBounds = Record<StoryStudioTextBlock, StoryStudioTextBound>;

export type StoryStudioLogoBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  layout: StoryStudioLogoLayout;
};

const roleLabels: Record<StoryStudioFrame["role"], string> = {
  result: "Résultat",
  context: "Fait marquant",
  poll: "Votre avis",
  question: "Posez votre question",
};

const MIN_HEADLINE_SIZE = 42;

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
};

const loadTemplateFont = async (template: StoryStudioTemplateDefinition): Promise<void> => {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`700 ${template.composition.headlineSize}px "${template.composition.fontFamily}"`),
      document.fonts.load(`400 ${template.composition.bodySize}px "${template.composition.fontFamily}"`),
    ]);
  } catch {
    throw new StoryStudioBrowserRenderError(
      "FONT_LOAD_FAILED",
      `Impossible de charger la police ${template.composition.fontFamily}.`
    );
  }
};

const loadPhoto = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.onload = () => resolve(image);
  image.onerror = () => reject(new StoryStudioBrowserRenderError(
    "PHOTO_CORS",
    "La photo est indisponible ou son chargement est bloqué par CORS."
  ));
  image.src = url;
});

const drawCoverPhoto = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  area: StoryStudioTemplateDefinition["composition"]["photo"],
  frame: StoryStudioFrame
) => {
  const baseScale = Math.max(area.width / image.naturalWidth, area.height / image.naturalHeight);
  const scale = baseScale * frame.photo.scale;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const overflowX = Math.max(0, width - area.width);
  const overflowY = Math.max(0, height - area.height);
  const x = area.x + (area.width - width) / 2 + frame.photo.x * overflowX / 2;
  const y = area.y + (area.height - height) / 2 + frame.photo.y * overflowY / 2;

  context.save();
  roundedRect(context, area.x, area.y, area.width, area.height, area.cornerRadius);
  context.clip();
  context.drawImage(image, x, y, width, height);
  context.restore();
};

const drawContainedImage = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
): Omit<StoryStudioLogoBounds, "layout"> => {
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const drawX = x + maxWidth - width;
  const drawY = y + (maxHeight - height) / 2;
  context.drawImage(image, drawX, drawY, width, height);
  return { x: drawX, y: drawY, width, height };
};

const isDarkColor = (color: string): boolean => {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return (red * 0.299 + green * 0.587 + blue * 0.114) / 255 < 0.55;
};

const applyBrandKit = (
  template: StoryStudioTemplateDefinition,
  brandKitSnapshot: StoryStudioBrandKitSnapshot | null | undefined,
): StoryStudioTemplateDefinition => brandKitSnapshot ? {
  ...template,
  composition: {
    ...template.composition,
    backgroundColor: brandKitSnapshot.primaryColor,
    secondaryColor: brandKitSnapshot.secondaryColor,
    foregroundColor: brandKitSnapshot.textColor,
    accentColor: brandKitSnapshot.accentColor,
    mutedColor: brandKitSnapshot.mutedTextColor,
    fontFamily: brandKitSnapshot.fontFamily,
  },
} : template;

const internalEditorialInstructionPattern = /^(?:aucune interaction\b|aucun(?:e)?(?:\s*[—–:-]|\s*$)|(?:instruction|indication)s?\s+(?:interne|éditoriale|editoriale|visuelle)|(?:ouverture|consigne)\s+visuelle|sticker\s+(?:questions?|sondage|quiz)\b|(?:visuel|photo|illustration|mise en page|animation)\s*[:—–-])/i;

const renderableText = (value: string): string => value
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !internalEditorialInstructionPattern.test(line))
  .join("\n");

const splitLines = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const splitBalancedLines = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): { lines: string[]; balanced: boolean } | null => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || maxLines < 1) return null;

  const memo = new Map<string, { lines: string[]; cost: number } | null>();
  const findPlan = (start: number, remainingLines: number): { lines: string[]; cost: number } | null => {
    if (start === words.length) return { lines: [], cost: 0 };
    if (remainingLines === 0) return null;
    const memoKey = `${start}:${remainingLines}`;
    if (memo.has(memoKey)) return memo.get(memoKey) ?? null;

    let best: { lines: string[]; cost: number } | null = null;
    for (let end = start + 1; end <= words.length; end += 1) {
      const line = words.slice(start, end).join(" ");
      const width = context.measureText(line).width;
      if (width > maxWidth) break;
      const tail = findPlan(end, remainingLines - 1);
      if (!tail) continue;
      const widthRatio = width / maxWidth;
      const isFinalLine = end === words.length;
      const orphanPenalty = isFinalLine && start > 0 && widthRatio < 0.34 ? 100 : 0;
      const cost = ((1 - widthRatio) ** 2) + orphanPenalty + tail.cost;
      if (!best || cost < best.cost) best = { lines: [line, ...tail.lines], cost };
    }
    memo.set(memoKey, best);
    return best;
  };

  const plan = findPlan(0, maxLines);
  if (!plan) return null;
  const lastLineWidth = context.measureText(plan.lines.at(-1) ?? "").width;
  return {
    lines: plan.lines,
    balanced: plan.lines.length === 1 || lastLineWidth / maxWidth >= 0.34,
  };
};

const drawWrappedText = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxHeight: number,
  truncate = true,
): number => {
  const maxLines = Math.floor(maxHeight / lineHeight);
  if (maxLines < 1) return 0;
  const allLines = splitLines(context, text, maxWidth);
  const lines = allLines.slice(0, maxLines);
  if (truncate && allLines.length > maxLines && lines.length > 0) {
    let lastLine = lines[lines.length - 1].trimEnd();
    while (lastLine && context.measureText(`${lastLine}…`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1).trimEnd();
    }
    lines[lines.length - 1] = `${lastLine}…`;
  }
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight, maxWidth));
  return lines.length * lineHeight;
};

const fitHeadline = (
  context: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  preferredSize: number,
  maxWidth: number,
  maxHeight: number,
) => {
  const minimumSize = Math.min(preferredSize, MIN_HEADLINE_SIZE);
  for (let fontSize = preferredSize; fontSize >= minimumSize; fontSize -= 2) {
    const lineHeight = fontSize * 1.04;
    context.font = `700 ${fontSize}px "${fontFamily}"`;
    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
    const plan = splitBalancedLines(context, text, maxWidth, maxLines);
    if (plan?.balanced) {
      return { fontSize, lineHeight, lines: plan.lines, height: plan.lines.length * lineHeight, overflow: false };
    }
  }
  const lineHeight = minimumSize * 1.04;
  context.font = `700 ${minimumSize}px "${fontFamily}"`;
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  const plan = splitBalancedLines(context, text, maxWidth, maxLines);
  const lines = plan?.lines ?? splitLines(context, text, maxWidth).slice(0, maxLines);
  return {
    fontSize: minimumSize,
    lineHeight,
    lines,
    height: lines.length * lineHeight,
    overflow: !plan?.balanced,
  };
};

const drawTemplateGraphics = (
  context: CanvasRenderingContext2D,
  template: StoryStudioTemplateDefinition
) => {
  const { composition, key } = template;
  context.fillStyle = composition.accentColor;
  if (key === "editorial_klique") {
    context.fillRect(composition.safeArea.left, composition.safeArea.top, 96, 8);
    context.fillStyle = composition.secondaryColor;
    context.fillRect(composition.safeArea.left + 104, composition.safeArea.top, 36, 8);
  } else if (key === "match_energy") {
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(330, 0);
    context.lineTo(0, 420);
    context.closePath();
    context.fill();
    context.fillStyle = composition.secondaryColor;
    context.fillRect(0, 420, 14, 180);
  } else {
    context.lineWidth = 3;
    context.strokeStyle = composition.accentColor;
    context.strokeRect(48, 48, template.canvas.width - 96, template.canvas.height - 96);
    context.fillStyle = composition.secondaryColor;
    context.fillRect(48, 48, 120, 8);
  }
};

export const renderStoryStudioFrameToCanvas = async ({
  canvas,
  frame,
  template,
  photoUrl,
  brandKitSnapshot,
  onTextBounds,
  onLogoBounds,
  onDiagnostics,
}: RenderStoryStudioFrameInput): Promise<void> => {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new StoryStudioBrowserRenderError("CANVAS_UNAVAILABLE", "Canvas 2D indisponible dans ce navigateur.");
  }

  const resolvedTemplate = applyBrandKit(template, brandKitSnapshot);
  canvas.width = resolvedTemplate.canvas.width;
  canvas.height = resolvedTemplate.canvas.height;
  await loadTemplateFont(resolvedTemplate);

  const { composition } = resolvedTemplate;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = composition.backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (frame.photo.visible) {
    if (!photoUrl) {
      throw new StoryStudioBrowserRenderError("PHOTO_UNAVAILABLE", "La photo sélectionnée est introuvable.");
    }
    const photo = await loadPhoto(photoUrl);
    drawCoverPhoto(context, photo, composition.photo, frame);
    if (composition.overlayOpacity > 0) {
      context.fillStyle = `rgba(0, 0, 0, ${composition.overlayOpacity})`;
      context.fillRect(composition.photo.x, composition.photo.y, composition.photo.width, composition.photo.height);
    }
  }

  drawTemplateGraphics(context, resolvedTemplate);

  if (brandKitSnapshot) {
    const logoUrl = isDarkColor(composition.backgroundColor)
      ? brandKitSnapshot.lightLogoUrl ?? brandKitSnapshot.darkLogoUrl
      : brandKitSnapshot.darkLogoUrl ?? brandKitSnapshot.lightLogoUrl;
    if (logoUrl) {
      const logo = await loadPhoto(logoUrl);
      const defaultLogo = composition.logo;
      const requestedLayout = frame.logoLayouts?.[template.key] ?? {
        x: defaultLogo.x,
        y: defaultLogo.y,
        scale: 1,
      };
      const logoWidth = defaultLogo.width * requestedLayout.scale;
      const logoHeight = defaultLogo.height * requestedLayout.scale;
      const layout = {
        x: Math.min(Math.max(requestedLayout.x, 0), canvas.width - logoWidth),
        y: Math.min(Math.max(requestedLayout.y, 0), canvas.height - logoHeight),
        scale: requestedLayout.scale,
      };
      const bounds = drawContainedImage(
        context,
        logo,
        layout.x,
        layout.y,
        logoWidth,
        logoHeight,
      );
      onLogoBounds?.({ ...bounds, layout });
    }
  }
  context.textAlign = composition.textAlign;
  context.textBaseline = "top";
  const safeLeft = composition.safeArea.left;
  const safeRight = canvas.width - composition.safeArea.right;
  const safeTop = composition.safeArea.top;
  const safeBottom = canvas.height - composition.safeArea.bottom;
  const eyebrowText = roleLabels[frame.role];
  const headlineText = renderableText(frame.text.headline);
  const bodyText = renderableText(frame.text.body);
  const savedLayout = frame.textLayouts?.[template.key];
  const defaultX = composition.textAlign === "center"
    ? composition.text.x + composition.text.width / 2
    : composition.text.x;
  const clampPosition = (position: StoryStudioTextPosition, minimumHeight: number): StoryStudioTextPosition => ({
    x: composition.textAlign === "center"
      ? Math.min(Math.max(position.x, safeLeft + 80), safeRight - 80)
      : Math.min(Math.max(position.x, safeLeft), safeRight - 160),
    y: Math.min(Math.max(position.y, safeTop), safeBottom - minimumHeight),
  });
  const availableWidth = (x: number) => composition.textAlign === "center"
    ? Math.max(160, 2 * Math.min(x - safeLeft, safeRight - x))
    : Math.max(160, safeRight - x);
  const boundX = (x: number, width: number) => composition.textAlign === "center" ? x - width / 2 : x;
  const eyebrowLineHeight = composition.eyebrowSize * 1.3;
  const headlineLineHeight = composition.headlineSize * 1.04;
  const bodyLineHeight = composition.bodySize * 1.3;
  const eyebrowPosition = clampPosition(
    savedLayout?.eyebrow ?? { x: defaultX, y: composition.text.y },
    eyebrowLineHeight,
  );
  const eyebrowWidth = availableWidth(eyebrowPosition.x);

  context.save();
  context.beginPath();
  context.rect(safeLeft, safeTop, safeRight - safeLeft, safeBottom - safeTop);
  context.clip();
  context.fillStyle = composition.accentColor;
  context.font = `700 ${composition.eyebrowSize}px "${composition.fontFamily}"`;
  context.fillText(eyebrowText, eyebrowPosition.x, eyebrowPosition.y, eyebrowWidth);

  const defaultHeadlineY = eyebrowPosition.y + eyebrowLineHeight + composition.text.gap;
  const headlinePosition = clampPosition(
    savedLayout?.headline ?? { x: defaultX, y: defaultHeadlineY },
    headlineLineHeight,
  );
  const headlineWidth = availableWidth(headlinePosition.x);
  let headlineHeight = headlineLineHeight;
  let headlineFontSize = composition.headlineSize;
  let headlineOverflow = false;

  if (headlineText) {
    context.fillStyle = composition.foregroundColor;
    const fittedHeadline = fitHeadline(
      context,
      headlineText,
      composition.fontFamily,
      composition.headlineSize,
      headlineWidth,
      safeBottom - headlinePosition.y,
    );
    headlineFontSize = fittedHeadline.fontSize;
    headlineOverflow = fittedHeadline.overflow;
    if (headlineOverflow && !onDiagnostics) {
      context.restore();
      throw new StoryStudioBrowserRenderError(
        "HEADLINE_OVERFLOW",
        "Le titre reste trop long à la taille minimale lisible. Réduisez-le ou repositionnez-le avant export.",
      );
    }
    context.font = `700 ${headlineFontSize}px "${composition.fontFamily}"`;
    fittedHeadline.lines.forEach((line, index) => {
      context.fillText(line, headlinePosition.x, headlinePosition.y + index * fittedHeadline.lineHeight, headlineWidth);
    });
    headlineHeight = fittedHeadline.height || headlineLineHeight;
  }

  const defaultBodyY = headlinePosition.y + headlineHeight + composition.text.gap;
  const bodyPosition = clampPosition(
    savedLayout?.body ?? { x: defaultX, y: defaultBodyY },
    bodyLineHeight,
  );
  const bodyWidth = availableWidth(bodyPosition.x);
  let bodyHeight = bodyLineHeight;
  if (bodyText) {
    context.fillStyle = composition.mutedColor;
    context.font = `400 ${composition.bodySize}px "${composition.fontFamily}"`;
    bodyHeight = drawWrappedText(
      context,
      bodyText,
      bodyPosition.x,
      bodyPosition.y,
      bodyWidth,
      bodyLineHeight,
      Math.max(bodyLineHeight, safeBottom - bodyPosition.y),
    ) || bodyLineHeight;
  }
  context.restore();

  onTextBounds?.({
    eyebrow: {
      x: boundX(eyebrowPosition.x, eyebrowWidth),
      y: eyebrowPosition.y,
      width: eyebrowWidth,
      height: eyebrowLineHeight,
      position: eyebrowPosition,
    },
    headline: {
      x: boundX(headlinePosition.x, headlineWidth),
      y: headlinePosition.y,
      width: headlineWidth,
      height: headlineHeight,
      position: headlinePosition,
    },
    body: {
      x: boundX(bodyPosition.x, bodyWidth),
      y: bodyPosition.y,
      width: bodyWidth,
      height: bodyHeight,
      position: bodyPosition,
    },
  });

  const isNativeStickerFrame = frame.role === "poll" || frame.role === "question";
  const interactionText = renderableText(frame.text.interaction);
  if (!isNativeStickerFrame && frame.elements.interactionZone && interactionText) {
    const interaction = composition.interaction;
    context.fillStyle = composition.accentColor;
    roundedRect(context, interaction.x, interaction.y, interaction.width, interaction.height, interaction.cornerRadius);
    context.fill();
    context.fillStyle = composition.secondaryColor;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${composition.interactionSize}px "${composition.fontFamily}"`;
    context.fillText(
      interactionText,
      interaction.x + interaction.width / 2,
      interaction.y + interaction.height / 2,
      interaction.width - 48
    );
  }

  onDiagnostics?.({
    headlineFontSize,
    headlineOverflow,
    stickerZone: isNativeStickerFrame ? composition.interaction : null,
  });

  const signatureVisible = brandKitSnapshot
    ? brandKitSnapshot.signatureMode !== "hidden"
    : frame.elements.logo || frame.elements.signature;
  if (signatureVisible) {
    context.save();
    const signatureOnDark = isDarkColor(composition.backgroundColor);
    const signatureRight = canvas.width - composition.safeArea.right;
    const signatureBaseline = canvas.height - composition.safeArea.bottom;
    context.font = `700 30px "${composition.fontFamily}"`;
    const signatureWidth = context.measureText("KLIQUE").width;
    context.fillStyle = signatureOnDark ? "rgba(0, 0, 0, 0.82)" : "rgba(255, 255, 255, 0.88)";
    roundedRect(context, signatureRight - signatureWidth - 24, signatureBaseline - 42, signatureWidth + 24, 54, 4);
    context.fill();
    context.fillStyle = signatureOnDark ? "#FFFFFF" : "#111111";
    context.textAlign = "right";
    context.textBaseline = "alphabetic";
    context.fillText("KLIQUE", signatureRight - 12, signatureBaseline);
    context.restore();
  }
};

export const exportStoryStudioCanvasPng = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new StoryStudioBrowserRenderError("EXPORT_FAILED", "Le navigateur n'a pas produit le fichier PNG."));
      }, "image/png");
    } catch (error) {
      const isSecurityError = error instanceof DOMException && error.name === "SecurityError";
      reject(new StoryStudioBrowserRenderError(
        isSecurityError ? "PHOTO_CORS" : "EXPORT_FAILED",
        isSecurityError
          ? "Export bloqué par CORS: la photo ne peut pas être intégrée au PNG."
          : "Impossible d'exporter la Story en PNG."
      ));
    }
  });