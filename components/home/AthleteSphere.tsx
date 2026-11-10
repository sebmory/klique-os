"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import Link from "next/link";
import { ArrowRight, Pause, Play } from "lucide-react";
import AthletePortrait from "@/components/public-athletes/AthletePortrait";
import {
  createAthleteSphereModel,
  findAthleteSphereNodeAtPoint,
  projectAthleteSphereNodes,
  type ProjectedAthleteSphereNode,
} from "@/lib/athlete-sphere";
import type { PublicAthleteCard, PublicSportColorCategory } from "@/lib/public-athletes";
import styles from "./athlete-sphere.module.css";

type AthleteSphereProps = {
  athletes: readonly PublicAthleteCard[];
  fallbackAthletes?: readonly PublicAthleteCard[];
  loadError?: boolean;
};

type CanvasState = "loading" | "ready" | "unavailable";

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
};

const pointColors: Record<PublicSportColorCategory, string> = {
  field: "#d9a441",
  court: "#efe5cf",
  combat: "#bd684c",
  endurance: "#c5b894",
  water: "#9bb9ad",
  other: "#e5d7b8",
};

const truncateCanvasText = (
  context: CanvasRenderingContext2D,
  value: string,
  maximumWidth: number,
): string => {
  if (context.measureText(value).width <= maximumWidth) return value;
  let shortened = value;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maximumWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
};

const drawTooltip = (
  context: CanvasRenderingContext2D,
  node: ProjectedAthleteSphereNode,
  width: number,
  height: number,
) => {
  const tooltipWidth = Math.min(230, Math.max(170, width * 0.42));
  const tooltipHeight = 70;
  const left = Math.min(
    width - tooltipWidth - 12,
    Math.max(12, node.screenX + (node.screenX > width / 2 ? -tooltipWidth - 18 : 18)),
  );
  const top = Math.min(height - tooltipHeight - 12, Math.max(12, node.screenY - 35));

  context.globalAlpha = 0.96;
  context.fillStyle = "#f5f0e5";
  context.fillRect(left, top, tooltipWidth, tooltipHeight);
  context.fillStyle = "#173c34";
  context.font = "700 13px sans-serif";
  context.fillText(truncateCanvasText(context, node.athlete.name, tooltipWidth - 22), left + 11, top + 21);
  context.fillStyle = "#8d3926";
  context.font = "700 10px sans-serif";
  context.fillText(truncateCanvasText(context, node.athlete.sport, tooltipWidth - 22), left + 11, top + 39);
  context.fillStyle = "#59655f";
  context.font = "11px sans-serif";
  context.fillText(truncateCanvasText(context, node.athlete.club, tooltipWidth - 22), left + 11, top + 57);
  context.globalAlpha = 1;
};

export default function AthleteSphere({
  athletes,
  fallbackAthletes = [],
  loadError = false,
}: AthleteSphereProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectedNodesRef = useRef<ProjectedAthleteSphereNode[]>([]);
  const drawRef = useRef<(() => void) | null>(null);
  const anglesRef = useRef({ yaw: -0.42, pitch: -0.14 });
  const dragRef = useRef<DragState | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIndexRef = useRef(0);
  const hoveredIndexRef = useRef<number | null>(null);
  const model = useMemo(() => createAthleteSphereModel(athletes), [athletes]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [canvasState, setCanvasState] = useState<CanvasState>("loading");
  const [manualPaused, setManualPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sectionVisible, setSectionVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const selectedAthlete = model.nodes[selectedIndex]?.athlete;
  const fallback = fallbackAthletes.length ? fallbackAthletes.slice(0, 6) : athletes.slice(0, 6);
  const rotationActive = canvasState === "ready"
    && sectionVisible
    && documentVisible
    && !reducedMotion
    && !manualPaused
    && !interacting;

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    drawRef.current?.();
  }, [selectedIndex]);

  useEffect(() => {
    hoveredIndexRef.current = hoveredIndex;
    drawRef.current?.();
  }, [hoveredIndex]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const updateVisibility = () => setDocumentVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") {
      setSectionVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setSectionVisible(entry?.isIntersecting ?? false),
      { rootMargin: "120px 0px", threshold: 0.05 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || model.nodes.length === 0) return;

    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext("2d");
    } catch (error) {
      console.error("[AthleteSphere] Canvas initialization failed", error);
    }
    if (!context) {
      setCanvasState("unavailable");
      return;
    }

    const drawingContext = context;
    let width = 0;
    let height = 0;
    let failed = false;
    const markUnavailable = (error: unknown) => {
      if (failed) return;
      failed = true;
      console.error("[AthleteSphere] Canvas rendering failed", error);
      setCanvasState("unavailable");
    };

    const draw = () => {
      if (failed || width <= 0 || height <= 0) return;
      try {
        drawingContext.clearRect(0, 0, width, height);
        const projected = projectAthleteSphereNodes(
          model.nodes,
          anglesRef.current.yaw,
          anglesRef.current.pitch,
          width,
          height,
        );
        projectedNodesRef.current = projected;

        drawingContext.lineWidth = 0.8;
        model.connections.forEach(({ from, to }) => {
          const start = projected[from];
          const end = projected[to];
          if (!start || !end) return;
          drawingContext.globalAlpha = 0.08 + ((start.opacity + end.opacity) / 2) * 0.18;
          drawingContext.strokeStyle = "#efe5cf";
          drawingContext.beginPath();
          drawingContext.moveTo(start.screenX, start.screenY);
          drawingContext.lineTo(end.screenX, end.screenY);
          drawingContext.stroke();
        });

        projected
          .slice()
          .sort((left, right) => left.depth - right.depth)
          .forEach((node) => {
            const selected = node.index === selectedIndexRef.current;
            const hovered = node.index === hoveredIndexRef.current;
            drawingContext.globalAlpha = node.opacity;
            drawingContext.fillStyle = pointColors[node.athlete.colorCategory];
            drawingContext.beginPath();
            drawingContext.arc(
              node.screenX,
              node.screenY,
              node.radius + (selected || hovered ? 2 : 0),
              0,
              Math.PI * 2,
            );
            drawingContext.fill();
            if (selected || hovered) {
              drawingContext.globalAlpha = 0.88;
              drawingContext.lineWidth = selected ? 2 : 1;
              drawingContext.strokeStyle = selected ? "#f2c66f" : "#f5f0e5";
              drawingContext.beginPath();
              drawingContext.arc(node.screenX, node.screenY, node.radius + 6, 0, Math.PI * 2);
              drawingContext.stroke();
            }
          });

        const hovered = hoveredIndexRef.current === null
          ? null
          : projected[hoveredIndexRef.current];
        if (hovered) drawTooltip(drawingContext, hovered, width, height);
        drawingContext.globalAlpha = 1;
      } catch (error) {
        markUnavailable(error);
      }
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(bounds.width));
      height = Math.max(1, Math.round(bounds.height));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      drawingContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      draw();
    };

    drawRef.current = draw;
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);
    window.addEventListener("resize", resize);
    resize();
    setCanvasState("ready");

    return () => {
      drawRef.current = null;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [model]);

  useEffect(() => {
    drawRef.current?.();
    if (!rotationActive) return;
    let animationFrame = 0;
    let previousTime = 0;
    const animate = (time: number) => {
      const elapsed = previousTime ? Math.min(time - previousTime, 50) : 0;
      previousTime = time;
      anglesRef.current.yaw += elapsed * 0.000055;
      drawRef.current?.();
      animationFrame = window.requestAnimationFrame(animate);
    };
    animationFrame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [rotationActive]);

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  }, []);

  const canvasPoint = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  }, []);

  const selectAtPoint = useCallback((x: number, y: number) => {
    const node = findAthleteSphereNodeAtPoint(projectedNodesRef.current, x, y);
    if (!node) return;
    setSelectedIndex(node.index);
    setHoveredIndex(node.index);
  }, []);

  const scheduleRotationResume = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setInteracting(false), 1200);
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      moved: false,
    };
    setInteracting(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      const node = findAthleteSphereNodeAtPoint(projectedNodesRef.current, point.x, point.y);
      setHoveredIndex(node?.index ?? null);
      return;
    }

    const deltaX = point.x - drag.lastX;
    const deltaY = point.y - drag.lastY;
    if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 4) drag.moved = true;
    drag.lastX = point.x;
    drag.lastY = point.y;
    anglesRef.current.yaw += deltaX * 0.008;
    anglesRef.current.pitch = Math.max(-0.9, Math.min(0.9, anglesRef.current.pitch + deltaY * 0.006));
    setHoveredIndex(null);
    drawRef.current?.();
  };

  const finishPointerInteraction = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = canvasPoint(event);
    if (!drag.moved) selectAtPoint(point.x, point.y);
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    scheduleRotationResume();
  };

  const handleCanvasKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!model.nodes.length) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      setSelectedIndex((current) => (current + direction + model.nodes.length) % model.nodes.length);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      anglesRef.current.pitch = Math.max(
        -0.9,
        Math.min(0.9, anglesRef.current.pitch + (event.key === "ArrowUp" ? -0.08 : 0.08)),
      );
      drawRef.current?.();
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      setManualPaused((paused) => !paused);
    }
  };

  const renderFallback = () => (
    <>
      <p className={styles.fallbackNotice} role="status">
        La visualisation interactive n’est pas disponible. Retrouvez cette sélection de profils.
      </p>
      <ul className={styles.fallbackGrid}>
        {fallback.map((athlete) => (
          <li key={athlete.slug}>
            <Link href={`/athletes/${athlete.slug}`} prefetch={false}>
              <div className={styles.fallbackPortrait}>
                <AthletePortrait
                  name={athlete.name}
                  sport={athlete.sport}
                  portrait={athlete.portrait}
                  colorCategory={athlete.colorCategory}
                  decorative
                />
              </div>
              <div>
                <p>{athlete.sport}</p>
                <h3>{athlete.name}</h3>
                <span>{athlete.club}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <section className={styles.section} aria-labelledby="athlete-sphere-title" ref={sectionRef}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Au cœur du réseau</p>
          <h2 id="athlete-sphere-title">Chaque parcours donne une nouvelle dimension au réseau.</h2>
          <p className={styles.intro}>
            Explorez les Athlètes publics de KLIQUE. La sphère est une représentation abstraite
            du réseau ; ses lignes ne décrivent pas de relations réelles entre les membres.
          </p>
        </div>
        <Link className={styles.directoryLink} href="/athletes" prefetch={false}>
          Découvrir tous les Athlètes <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>

      {loadError ? (
        <div className={styles.state} role="alert">
          <div>
            <h3>Les Athlètes sont momentanément indisponibles.</h3>
            <p>Le reste de l’accueil reste accessible. Vous pouvez réessayer depuis l’annuaire.</p>
            <Link className={styles.directoryLink} href="/athletes" prefetch={false}>Ouvrir l’annuaire</Link>
          </div>
        </div>
      ) : model.nodes.length === 0 ? (
        <div className={styles.state} role="status">
          <div>
            <h3>Aucun profil public à afficher pour le moment.</h3>
            <p>L’annuaire sera enrichi dès que de nouveaux parcours seront publiés.</p>
            <Link className={styles.directoryLink} href="/athletes" prefetch={false}>Ouvrir l’annuaire</Link>
          </div>
        </div>
      ) : canvasState === "unavailable" ? renderFallback() : (
        <>
          <div className={styles.layout}>
            <div className={styles.stage}>
              <canvas
                className={styles.canvas}
                ref={canvasRef}
                tabIndex={0}
                aria-label={`Sphère interactive de ${model.nodes.length} Athlètes. Utilisez les flèches gauche et droite pour changer de profil, les flèches haut et bas pour orienter la sphère, et la barre d’espace pour suspendre ou reprendre la rotation.`}
                aria-describedby="athlete-sphere-instructions"
                onKeyDown={handleCanvasKeyDown}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishPointerInteraction}
                onPointerCancel={finishPointerInteraction}
                onPointerLeave={() => {
                  if (!dragRef.current) setHoveredIndex(null);
                }}
              />
              <p className={styles.stageStatus}>
                {canvasState === "loading"
                  ? "Initialisation de la sphère…"
                  : `${model.nodes.length} Athlètes · Glissez pour explorer`}
              </p>
              <div className={styles.controls}>
                {reducedMotion ? (
                  <span className={`${styles.control} ${styles.motionDisabled}`}>
                    Mouvement réduit
                  </span>
                ) : (
                  <button
                    className={styles.control}
                    type="button"
                    onClick={() => setManualPaused((paused) => !paused)}
                    aria-pressed={manualPaused}
                  >
                    {manualPaused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
                    {manualPaused ? "Reprendre" : "Pause"}
                  </button>
                )}
              </div>
            </div>

            {selectedAthlete ? (
              <article className={styles.selectedCard} aria-live="polite">
                <div className={styles.portrait}>
                  <AthletePortrait
                    name={selectedAthlete.name}
                    sport={selectedAthlete.sport}
                    portrait={selectedAthlete.portrait}
                    colorCategory={selectedAthlete.colorCategory}
                  />
                </div>
                <div className={styles.selectedCopy}>
                  <p>{selectedAthlete.sport}</p>
                  <h3>{selectedAthlete.name}</h3>
                  <p className={styles.club}>{selectedAthlete.club}</p>
                  <Link
                    className={styles.profileLink}
                    href={`/athletes/${selectedAthlete.slug}`}
                    prefetch={false}
                  >
                    Découvrir le profil <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ) : null}
          </div>

          <p id="athlete-sphere-instructions" className={styles.networkNote}>
            Souris, tactile ou clavier : faites tourner la sphère puis sélectionnez un point.
            La rotation se suspend pendant l’interaction et reprend ensuite en douceur.
          </p>

          <details className={styles.roster}>
            <summary>Parcourir les {model.nodes.length} Athlètes au clavier</summary>
            <ul className={styles.rosterList}>
              {model.nodes.map((node, index) => (
                <li key={node.athlete.slug}>
                  <button
                    type="button"
                    aria-pressed={index === selectedIndex}
                    onClick={() => setSelectedIndex(index)}
                  >
                    {node.athlete.name} · {node.athlete.sport}
                  </button>
                </li>
              ))}
            </ul>
          </details>

          <noscript>
            <p>La sphère nécessite JavaScript. L’annuaire Athlètes reste entièrement accessible.</p>
          </noscript>
          <span className={styles.visuallyHidden} aria-live="polite">
            {selectedAthlete
              ? `Athlète sélectionné : ${selectedAthlete.name}, ${selectedAthlete.sport}, ${selectedAthlete.club}.`
              : ""}
          </span>
        </>
      )}
    </section>
  );
}
