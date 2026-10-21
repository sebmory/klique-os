"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArticleCreationDraftApiError,
  ArticleCreationDraftClient,
  SerializedArticleDraftSaveQueue,
  articleDraftRecoveryStorageKey,
  createArticleDraftClientCreationId,
  type ArticleDraftSaveState,
} from "@/services/article-creation-drafts";
import type {
  ArticleCreationDraftPayload,
  ArticleCreationDraftRecord,
  ArticleCreationDraftSummary,
} from "@/types/article-creation-draft";

const AUTOSAVE_DELAY_MS = 900;
const LEGACY_WORKFLOW_STORAGE_KEY = "klique.contents.creation-assistant.workflow.v2";

type UseArticleDraftPersistenceArgs = {
  enabled: boolean;
  active: boolean;
  initialDraftId?: string;
  contextKey: string;
  hydrated: boolean;
  payload: ArticleCreationDraftPayload;
  meaningful: boolean;
  onRestore: (payload: ArticleCreationDraftPayload) => void;
  onNew: () => void;
  buildLegacyPayload: (raw: string) => ArticleCreationDraftPayload | null;
};

const titleFor = (payload: ArticleCreationDraftPayload): string => {
  const subject = payload.draft.subject.displayName.trim() || "Sujet sans nom";
  const type = payload.draft.objective.subtypeId.trim() || "Article";
  return `${subject} — ${type}`;
};

const replaceDraftIdInUrl = (draftId?: string) => {
  const url = new URL(window.location.href);
  if (draftId) url.searchParams.set("draftId", draftId);
  else url.searchParams.delete("draftId");
  window.history.replaceState(window.history.state, "", url);
};

export function useArticleDraftPersistence({
  enabled,
  active,
  initialDraftId,
  contextKey,
  hydrated,
  payload,
  meaningful,
  onRestore,
  onNew,
  buildLegacyPayload,
}: UseArticleDraftPersistenceArgs) {
  const [saveState, setSaveState] = useState<ArticleDraftSaveState>(enabled ? "loading" : "idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ArticleCreationDraftSummary[]>([]);
  const [storageScope, setStorageScope] = useState("");
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(!enabled);
  const [storageAvailable, setStorageAvailable] = useState(false);
  const [privacyNoticeVisible, setPrivacyNoticeVisible] = useState(false);
  const [legacyDraftAvailable, setLegacyDraftAvailable] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const activeDraftIdRef = useRef<string | null>(null);
  const activeVersionRef = useRef<number | null>(null);
  const clientCreationIdRef = useRef(createArticleDraftClientCreationId());
  const queueRef = useRef(new SerializedArticleDraftSaveQueue<ArticleCreationDraftPayload>());
  const autosaveTimerRef = useRef<number | null>(null);
  const deletingRef = useRef(false);
  const skipRestoredPayloadRef = useRef(false);
  const latestPayloadRef = useRef(payload);
  const recoveryKeyRef = useRef<string | null>(null);
  const initializingRef = useRef(enabled && active);

  const setActiveRecord = useCallback((record: ArticleCreationDraftRecord) => {
    activeDraftIdRef.current = record.id;
    activeVersionRef.current = record.version;
    clientCreationIdRef.current = record.clientCreationId;
    setActiveDraftId(record.id);
    setActiveVersion(record.version);
    setDrafts((current) => [
      {
        id: record.id,
        displayTitle: record.displayTitle,
        subjectName: record.subjectName,
        stepId: record.stepId,
        version: record.version,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      ...current.filter((item) => item.id !== record.id),
    ]);
    replaceDraftIdInUrl(record.id);
  }, []);

  const restoreRecord = useCallback((record: ArticleCreationDraftRecord) => {
    skipRestoredPayloadRef.current = true;
    queueRef.current = new SerializedArticleDraftSaveQueue<ArticleCreationDraftPayload>();
    queueRef.current.reset(record.payload);
    setActiveRecord(record);
    setConflictVersion(null);
    setErrorMessage(null);
    setSaveState("saved");
    onRestore(record.payload);
  }, [onRestore, setActiveRecord]);

  const refreshList = useCallback(async () => {
    const result = await ArticleCreationDraftClient.list();
    setDrafts(result.drafts);
    setStorageScope(result.storageScope);
    recoveryKeyRef.current = articleDraftRecoveryStorageKey(result.storageScope, contextKey);
    setLegacyDraftAvailable(Boolean(window.sessionStorage.getItem(LEGACY_WORKFLOW_STORAGE_KEY)));
    return result;
  }, [contextKey]);

  useEffect(() => {
    if (!enabled || !active) return;
    initializingRef.current = true;
    let cancelled = false;
    const initialize = async () => {
      setSaveState("loading");
      setErrorMessage(null);
      try {
        await refreshList();
        if (initialDraftId) {
          const record = await ArticleCreationDraftClient.load(initialDraftId);
          if (cancelled) return;
          restoreRecord(record);
        } else if (!cancelled) {
          setSaveState("idle");
        }
        if (!cancelled) setStorageAvailable(true);
      } catch (error) {
        if (cancelled) return;
        setSaveState("error");
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger les brouillons Article.");
      } finally {
        if (!cancelled) {
          initializingRef.current = false;
          setInitialized(true);
        }
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [active, enabled, initialDraftId, refreshList, restoreRecord]);

  const saveSnapshot = useCallback(async (snapshot: ArticleCreationDraftPayload) => {
    if (deletingRef.current) return "conflict" as const;
    try {
      let record: ArticleCreationDraftRecord;
      if (activeDraftIdRef.current && activeVersionRef.current) {
        record = await ArticleCreationDraftClient.update(activeDraftIdRef.current, {
          expectedVersion: activeVersionRef.current,
          displayTitle: titleFor(snapshot),
          payload: snapshot,
        });
      } else {
        record = await ArticleCreationDraftClient.create({
          clientCreationId: clientCreationIdRef.current,
          displayTitle: titleFor(snapshot),
          payload: snapshot,
        });
        setPrivacyNoticeVisible(true);
      }
      setActiveRecord(record);
      return "saved" as const;
    } catch (error) {
      if (error instanceof ArticleCreationDraftApiError && error.status === 409) {
        setConflictVersion(error.currentVersion ?? activeVersionRef.current);
        setErrorMessage("Une version plus récente existe. Cet onglet n’a pas écrasé votre travail.");
        setSaveState("conflict");
        return "conflict" as const;
      }
      throw error;
    }
  }, [setActiveRecord]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (!enabled || !active || !queueRef.current.hasPending()) return true;
    if (conflictVersion !== null || deletingRef.current) return false;
    setSaveState("saving");
    setErrorMessage(null);
    try {
      const result = await queueRef.current.flush(saveSnapshot);
      if (result === "conflict") return false;
      setSaveState("saved");
      return true;
    } catch (error) {
      setSaveState("error");
      setErrorMessage(error instanceof Error ? error.message : "Enregistrement impossible.");
      return false;
    }
  }, [active, conflictVersion, enabled, saveSnapshot]);

  useEffect(() => {
    latestPayloadRef.current = payload;
    if (
      !enabled
      || !active
      || initializingRef.current
      || !initialized
      || !storageAvailable
      || !hydrated
      || !meaningful
      || conflictVersion !== null
    ) return;
    if (skipRestoredPayloadRef.current) {
      skipRestoredPayloadRef.current = false;
      return;
    }
    queueRef.current.update(payload);
    if (recoveryKeyRef.current) {
      window.sessionStorage.setItem(recoveryKeyRef.current, JSON.stringify(payload));
    }
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void flush();
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [
    active,
    conflictVersion,
    enabled,
    flush,
    hydrated,
    initialized,
    meaningful,
    payload,
    storageAvailable,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!queueRef.current.hasPending()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [enabled]);

  const loadDraft = useCallback(async (draftId: string): Promise<boolean> => {
    if (!(await flush())) return false;
    setSaveState("loading");
    try {
      restoreRecord(await ArticleCreationDraftClient.load(draftId));
      setManagerOpen(false);
      return true;
    } catch (error) {
      setSaveState("error");
      setErrorMessage(error instanceof Error ? error.message : "Impossible de charger ce brouillon.");
      return false;
    }
  }, [flush, restoreRecord]);

  const startNew = useCallback(async (): Promise<boolean> => {
    if (!(await flush())) return false;
    queueRef.current.stop();
    queueRef.current = new SerializedArticleDraftSaveQueue<ArticleCreationDraftPayload>();
    activeDraftIdRef.current = null;
    activeVersionRef.current = null;
    clientCreationIdRef.current = createArticleDraftClientCreationId();
    setActiveDraftId(null);
    setActiveVersion(null);
    setConflictVersion(null);
    setErrorMessage(null);
    setSaveState("idle");
    replaceDraftIdInUrl();
    onNew();
    setManagerOpen(false);
    return true;
  }, [flush, onNew]);

  const removeDraft = useCallback(async (draftId: string): Promise<boolean> => {
    if (!window.confirm("Supprimer définitivement ce brouillon Article de votre espace privé ?")) return false;
    const removesActiveDraft = draftId === activeDraftIdRef.current;
    if (removesActiveDraft && !(await flush())) return false;
    if (removesActiveDraft) {
      deletingRef.current = true;
      queueRef.current.stop();
    }
    try {
      await ArticleCreationDraftClient.remove(draftId);
      setDrafts((current) => current.filter((item) => item.id !== draftId));
      if (removesActiveDraft) {
        if (recoveryKeyRef.current) window.sessionStorage.removeItem(recoveryKeyRef.current);
        activeDraftIdRef.current = null;
        activeVersionRef.current = null;
        setActiveDraftId(null);
        setActiveVersion(null);
        replaceDraftIdInUrl();
        onNew();
        setSaveState("idle");
        setManagerOpen(false);
      }
      return true;
    } catch (error) {
      setSaveState("error");
      setErrorMessage(error instanceof Error ? error.message : "Suppression impossible.");
      return false;
    } finally {
      if (removesActiveDraft) deletingRef.current = false;
    }
  }, [flush, onNew]);

  const loadServerVersion = useCallback(async () => {
    if (!activeDraftIdRef.current) return;
    setSaveState("loading");
    try {
      restoreRecord(await ArticleCreationDraftClient.load(activeDraftIdRef.current));
    } catch (error) {
      setSaveState("error");
      setErrorMessage(error instanceof Error ? error.message : "Impossible de charger la version serveur.");
    }
  }, [restoreRecord]);

  const duplicateLocalVersion = useCallback(async () => {
    const localPayload = latestPayloadRef.current;
    queueRef.current = new SerializedArticleDraftSaveQueue<ArticleCreationDraftPayload>();
    activeDraftIdRef.current = null;
    activeVersionRef.current = null;
    clientCreationIdRef.current = createArticleDraftClientCreationId();
    setActiveDraftId(null);
    setActiveVersion(null);
    setConflictVersion(null);
    setErrorMessage(null);
    setSaveState("saving");
    queueRef.current.update(localPayload);
    try {
      const record = await ArticleCreationDraftClient.create({
        clientCreationId: clientCreationIdRef.current,
        displayTitle: titleFor(localPayload),
        payload: localPayload,
      });
      queueRef.current.reset(localPayload);
      setActiveRecord(record);
      setPrivacyNoticeVisible(true);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setErrorMessage(error instanceof Error ? error.message : "Enregistrement impossible.");
    }
  }, [setActiveRecord]);

  const importLegacyDraft = useCallback(async () => {
    const raw = window.sessionStorage.getItem(LEGACY_WORKFLOW_STORAGE_KEY);
    if (!raw) return;
    const imported = buildLegacyPayload(raw);
    if (!imported) {
      setErrorMessage("Le brouillon local historique est invalide et n’a pas été importé.");
      return;
    }
    onRestore(imported);
    window.sessionStorage.removeItem(LEGACY_WORKFLOW_STORAGE_KEY);
    setLegacyDraftAvailable(false);
    queueRef.current.update(imported);
    await flush();
  }, [buildLegacyPayload, flush, onRestore]);

  return useMemo(() => ({
    saveState,
    errorMessage,
    drafts,
    storageScope,
    activeDraftId,
    activeVersion,
    conflictVersion,
    initialized,
    privacyNoticeVisible,
    legacyDraftAvailable,
    managerOpen,
    setManagerOpen,
    dismissPrivacyNotice: () => setPrivacyNoticeVisible(false),
    retry: flush,
    flushBeforeNavigation: flush,
    loadDraft,
    startNew,
    removeDraft,
    loadServerVersion,
    duplicateLocalVersion,
    importLegacyDraft,
    refreshList,
  }), [
    activeDraftId,
    activeVersion,
    conflictVersion,
    drafts,
    duplicateLocalVersion,
    errorMessage,
    flush,
    importLegacyDraft,
    initialized,
    legacyDraftAvailable,
    loadDraft,
    loadServerVersion,
    managerOpen,
    privacyNoticeVisible,
    refreshList,
    removeDraft,
    saveState,
    startNew,
    storageScope,
  ]);
}
