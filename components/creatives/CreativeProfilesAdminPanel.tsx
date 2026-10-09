"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CheckCircle2, ExternalLink, Pencil, Plus, Power, RefreshCw, X } from "lucide-react";
import { Button, Card, Input, Select, Textarea } from "@/src/design-system/components";
import type {
  CreativeProfile,
  CreativeStatus,
  CreativeType,
  CreateManualCreativeProfileInput,
  UpdateCreativeProfileInput,
} from "@/types/creative";
import styles from "./creative-profiles-admin.module.css";

type ProfilesResponse = {
  profiles?: CreativeProfile[];
  profile?: CreativeProfile;
  error?: string;
};

type ProfileForm = {
  displayName: string;
  creativeType: CreativeType;
  contactEmail: string;
  phone: string;
  websiteUrl: string;
  portfolioUrl: string;
  instagram: string;
  city: string;
  country: string;
  coverageAreas: string;
  specialties: string;
  bio: string;
  status: CreativeStatus;
};

export const CREATIVE_DEACTIVATION_CONFIRMATION =
  "Désactiver cette fiche créative ? Elle ne sera plus considérée comme active.";

const creativeTypeLabels: Record<CreativeType, string> = {
  photographer: "Photographe",
  videographer: "Vidéaste",
  both: "Photographe et vidéaste",
};

const formFromProfile = (profile: CreativeProfile): ProfileForm => ({
  displayName: profile.displayName,
  creativeType: profile.creativeType,
  contactEmail: profile.contactEmail,
  phone: profile.phone ?? "",
  websiteUrl: profile.websiteUrl ?? "",
  portfolioUrl: profile.portfolioUrl ?? "",
  instagram: profile.instagram ?? "",
  city: profile.city ?? "",
  country: profile.country ?? "",
  coverageAreas: profile.coverageAreas.join(", "),
  specialties: profile.specialties.join(", "),
  bio: profile.bio ?? "",
  status: profile.status,
});

const emptyProfileForm = (): ProfileForm => ({
  displayName: "",
  creativeType: "photographer",
  contactEmail: "",
  phone: "",
  websiteUrl: "",
  portfolioUrl: "",
  instagram: "",
  city: "",
  country: "",
  coverageAreas: "",
  specialties: "",
  bio: "",
  status: "active",
});

const splitList = (value: string): string[] => [...new Set(
  value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean),
)];

const updateFromForm = (form: ProfileForm): UpdateCreativeProfileInput => ({
  displayName: form.displayName.trim(),
  creativeType: form.creativeType,
  contactEmail: form.contactEmail.trim(),
  phone: form.phone.trim() || null,
  websiteUrl: form.websiteUrl.trim() || null,
  portfolioUrl: form.portfolioUrl.trim() || null,
  instagram: form.instagram.trim() || null,
  city: form.city.trim() || null,
  country: form.country.trim() || null,
  coverageAreas: splitList(form.coverageAreas),
  specialties: splitList(form.specialties),
  bio: form.bio.trim() || null,
});

const createFromForm = (form: ProfileForm): CreateManualCreativeProfileInput => ({
  displayName: form.displayName.trim(),
  creativeType: form.creativeType,
  contactEmail: form.contactEmail.trim(),
  phone: form.phone.trim() || null,
  websiteUrl: form.websiteUrl.trim() || null,
  portfolioUrl: form.portfolioUrl.trim() || null,
  instagram: form.instagram.trim() || null,
  city: form.city.trim() || null,
  country: form.country.trim() || null,
  coverageAreas: splitList(form.coverageAreas),
  specialties: splitList(form.specialties),
  bio: form.bio.trim() || null,
  status: form.status,
});

const externalUrl = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

const formatDate = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Date inconnue"
    : parsed.toLocaleString("fr-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const readError = async (response: Response, fallback: string): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as ProfilesResponse | null;
  return payload?.error || fallback;
};

export function CreativeProfilesAdminPanel() {
  const [profiles, setProfiles] = useState<CreativeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const activeActions = useRef(new Set<string>());

  const loadProfiles = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/admin/creatives", {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    const payload = (await response.json().catch(() => null)) as ProfilesResponse | null;
    if (!response.ok || !Array.isArray(payload?.profiles)) {
      throw new Error(payload?.error || "Impossible de charger les fiches créatives.");
    }
    setProfiles(payload.profiles);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    void loadProfiles(controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error ? error.message : "Impossible de charger les fiches créatives.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadProfiles]);

  const startEditing = (profile: CreativeProfile) => {
    setCreating(false);
    setEditingId(profile.id);
    setForm(formFromProfile(profile));
    setActionError(null);
    setSuccessMessage(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setCreating(false);
    setForm(null);
  };

  const startCreating = () => {
    setEditingId(null);
    setCreating(true);
    setForm(emptyProfileForm());
    setActionError(null);
    setSuccessMessage(null);
  };

  const patchProfile = async (
    profile: CreativeProfile,
    input: UpdateCreativeProfileInput,
  ): Promise<CreativeProfile> => {
    const response = await fetch(`/api/admin/creatives/${encodeURIComponent(profile.id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as ProfilesResponse | null;
    if (!response.ok || !payload?.profile) {
      throw new Error(payload?.error || "La fiche créative n’a pas pu être enregistrée.");
    }
    return payload.profile;
  };

  const createProfile = async (input: CreateManualCreativeProfileInput): Promise<CreativeProfile> => {
    const response = await fetch("/api/admin/creatives", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as ProfilesResponse | null;
    if (!response.ok || !payload?.profile) {
      throw new Error(payload?.error || "La fiche créative n’a pas pu être créée.");
    }
    return payload.profile;
  };

  const runAction = async (
    actionId: string,
    action: () => Promise<void>,
  ) => {
    if (activeActions.current.has(actionId)) return;
    activeActions.current.add(actionId);
    setBusyId(actionId);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "La fiche créative n’a pas pu être enregistrée.",
      );
    } finally {
      activeActions.current.delete(actionId);
      setBusyId(null);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>, profile: CreativeProfile) => {
    event.preventDefault();
    if (!form) return;
    await runAction(profile.id, async () => {
      await patchProfile(profile, updateFromForm(form));
      setSuccessMessage("Fiche créative enregistrée.");
      cancelEditing();
      await loadProfiles();
    });
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    await runAction("create", async () => {
      await createProfile(createFromForm(form));
      setSuccessMessage("Fiche créative créée.");
      cancelEditing();
      await loadProfiles();
    });
  };

  const setStatus = async (profile: CreativeProfile, status: CreativeStatus) => {
    if (activeActions.current.has(profile.id)) return;
    if (status === "inactive" && !window.confirm(CREATIVE_DEACTIVATION_CONFIRMATION)) return;
    await runAction(profile.id, async () => {
      await patchProfile(profile, { status });
      setSuccessMessage(status === "active" ? "Fiche créative activée." : "Fiche créative désactivée.");
      await loadProfiles();
    });
  };

  if (loading) {
    return (
      <div className={styles.state} role="status" aria-live="polite">
        <RefreshCw className={styles.spinner} size={22} aria-hidden />
        Chargement des fiches créatives…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.state} role="alert">
        <strong>Impossible de charger les fiches créatives.</strong>
        <span>{loadError}</span>
        <Button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            setLoading(true);
            setLoadError(null);
            void loadProfiles()
              .catch(() => setLoadError("Impossible de charger les fiches créatives."))
              .finally(() => setLoading(false));
          }}
        >
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="creative-profiles-title">
      <header className={styles.panelHeader}>
        <div>
          <h2 id="creative-profiles-title">Fiches créatives canoniques</h2>
          <p>Fiches issues des candidatures approuvées ou créées manuellement par un Admin.</p>
        </div>
        <div className={styles.headerActions}>
          <span>{profiles.length} fiche{profiles.length === 1 ? "" : "s"}</span>
          <Button
            type="button"
            className={styles.primaryButton}
            disabled={busyId !== null || creating}
            onClick={startCreating}
          >
            <Plus size={16} aria-hidden />
            Créer une fiche
          </Button>
        </div>
      </header>

      {successMessage ? (
        <p className={styles.success} role="status" aria-live="polite">
          <CheckCircle2 size={18} aria-hidden />
          {successMessage}
        </p>
      ) : null}
      {actionError ? <p className={styles.error} role="alert">{actionError}</p> : null}

      {creating && form ? (
        <Card className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3>Nouvelle fiche créative</h3>
              <p>Création manuelle auditée dans votre workspace.</p>
            </div>
          </div>
          <form
            className={styles.form}
            onSubmit={(event) => void create(event)}
            aria-label="Créer une fiche créative"
          >
            <label>
              <span>Nom affiché</span>
              <Input
                value={form.displayName}
                required
                disabled={busyId !== null}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
              />
            </label>
            <label>
              <span>Type créatif</span>
              <Select
                value={form.creativeType}
                disabled={busyId !== null}
                onChange={(event) => setForm({
                  ...form,
                  creativeType: event.target.value as CreativeType,
                })}
              >
                {Object.entries(creativeTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </label>
            <label>
              <span>E-mail</span>
              <Input
                type="email"
                value={form.contactEmail}
                required
                disabled={busyId !== null}
                onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
              />
            </label>
            <label>
              <span>Statut initial</span>
              <Select
                value={form.status}
                disabled={busyId !== null}
                onChange={(event) => setForm({
                  ...form,
                  status: event.target.value as CreativeStatus,
                })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </label>
            <label>
              <span>Téléphone</span>
              <Input
                value={form.phone}
                disabled={busyId !== null}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </label>
            <label>
              <span>Portfolio</span>
              <Input
                type="url"
                value={form.portfolioUrl}
                disabled={busyId !== null}
                onChange={(event) => setForm({ ...form, portfolioUrl: event.target.value })}
              />
            </label>
            <label>
              <span>Site internet</span>
              <Input
                type="url"
                value={form.websiteUrl}
                disabled={busyId !== null}
                onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })}
              />
            </label>
            <label>
              <span>Instagram</span>
              <Input
                value={form.instagram}
                disabled={busyId !== null}
                onChange={(event) => setForm({ ...form, instagram: event.target.value })}
              />
            </label>
            <label>
              <span>Ville</span>
              <Input
                value={form.city}
                disabled={busyId !== null}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
              />
            </label>
            <label>
              <span>Pays</span>
              <Input
                value={form.country}
                disabled={busyId !== null}
                onChange={(event) => setForm({ ...form, country: event.target.value })}
              />
            </label>
            <label className={styles.wide}>
              <span>Zones couvertes, séparées par des virgules</span>
              <Input
                value={form.coverageAreas}
                disabled={busyId !== null}
                onChange={(event) => setForm({ ...form, coverageAreas: event.target.value })}
              />
            </label>
            <label className={styles.wide}>
              <span>Spécialités, séparées par des virgules</span>
              <Input
                value={form.specialties}
                disabled={busyId !== null}
                onChange={(event) => setForm({ ...form, specialties: event.target.value })}
              />
            </label>
            <label className={styles.wide}>
              <span>Biographie</span>
              <Textarea
                value={form.bio}
                disabled={busyId !== null}
                onChange={(event) => setForm({ ...form, bio: event.target.value })}
              />
            </label>
            <div className={`${styles.actions} ${styles.wide}`}>
              <Button
                type="submit"
                className={styles.primaryButton}
                disabled={busyId !== null}
                aria-busy={busyId === "create"}
              >
                {busyId === "create" ? "Création…" : "Créer la fiche"}
              </Button>
              <Button
                type="button"
                className={styles.secondaryButton}
                disabled={busyId !== null}
                onClick={cancelEditing}
              >
                <X size={16} aria-hidden />
                Annuler
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {profiles.length === 0 && !creating ? (
        <div className={styles.state}>
          <strong>Aucune fiche créative canonique.</strong>
          <span>Approuvez une candidature ou créez une fiche manuellement.</span>
        </div>
      ) : (
        <div className={styles.grid}>
          {profiles.map((profile) => {
            const isEditing = editingId === profile.id;
            const isBusy = busyId === profile.id;
            const actionsLocked = busyId !== null;
            const portfolioUrl = externalUrl(profile.portfolioUrl);
            return (
              <Card key={profile.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3>{profile.displayName}</h3>
                    <p>{creativeTypeLabels[profile.creativeType]}</p>
                  </div>
                  <span className={profile.status === "active" ? styles.active : styles.inactive}>
                    {profile.status === "active" ? "Active" : "Inactive"}
                  </span>
                </div>

                {isEditing && form ? (
                  <form
                    className={styles.form}
                    onSubmit={(event) => void save(event, profile)}
                    aria-label={`Modifier la fiche de ${profile.displayName}`}
                  >
                    <label>
                      <span>Nom affiché</span>
                      <Input
                        value={form.displayName}
                        required
                        disabled={actionsLocked}
                        onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Type créatif</span>
                      <Select
                        value={form.creativeType}
                        disabled={actionsLocked}
                        onChange={(event) => setForm({
                          ...form,
                          creativeType: event.target.value as CreativeType,
                        })}
                      >
                        {Object.entries(creativeTypeLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </Select>
                    </label>
                    <label>
                      <span>E-mail</span>
                      <Input
                        type="email"
                        value={form.contactEmail}
                        required
                        disabled={actionsLocked}
                        onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Téléphone</span>
                      <Input
                        value={form.phone}
                        disabled={actionsLocked}
                        onChange={(event) => setForm({ ...form, phone: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Portfolio</span>
                      <Input
                        type="url"
                        value={form.portfolioUrl}
                        disabled={actionsLocked}
                        onChange={(event) => setForm({ ...form, portfolioUrl: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Site internet</span>
                      <Input
                        type="url"
                        value={form.websiteUrl}
                        disabled={actionsLocked}
                        onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Instagram</span>
                      <Input
                        value={form.instagram}
                        disabled={actionsLocked}
                        onChange={(event) => setForm({ ...form, instagram: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Ville</span>
                      <Input
                        value={form.city}
                        disabled={actionsLocked}
                        onChange={(event) => setForm({ ...form, city: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Pays</span>
                      <Input
                        value={form.country}
                        disabled={actionsLocked}
                        onChange={(event) => setForm({ ...form, country: event.target.value })}
                      />
                    </label>
                    <label className={styles.wide}>
                      <span>Zones couvertes, séparées par des virgules</span>
                      <Input
                        value={form.coverageAreas}
                        disabled={actionsLocked}
                        onChange={(event) => setForm({ ...form, coverageAreas: event.target.value })}
                      />
                    </label>
                    <label className={styles.wide}>
                      <span>Spécialités, séparées par des virgules</span>
                      <Input
                        value={form.specialties}
                        disabled={actionsLocked}
                        onChange={(event) => setForm({ ...form, specialties: event.target.value })}
                      />
                    </label>
                    <label className={styles.wide}>
                      <span>Biographie</span>
                      <Textarea
                        value={form.bio}
                        disabled={actionsLocked}
                        onChange={(event) => setForm({ ...form, bio: event.target.value })}
                      />
                    </label>
                    <div className={`${styles.actions} ${styles.wide}`}>
                      <Button
                        type="submit"
                        className={styles.primaryButton}
                        disabled={actionsLocked}
                        aria-busy={isBusy}
                      >
                        {isBusy ? "Enregistrement…" : "Enregistrer"}
                      </Button>
                      <Button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={actionsLocked}
                        onClick={cancelEditing}
                      >
                        <X size={16} aria-hidden />
                        Annuler
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <dl className={styles.summary}>
                      <div><dt>E-mail</dt><dd>{profile.contactEmail}</dd></div>
                      <div><dt>Téléphone</dt><dd>{profile.phone || "Non renseigné"}</dd></div>
                      <div><dt>Zone</dt><dd>{profile.coverageAreas.join(", ") || "Non renseignée"}</dd></div>
                      <div><dt>Spécialités</dt><dd>{profile.specialties.join(", ") || "Non renseignées"}</dd></div>
                      <div><dt>Localisation</dt><dd>{[profile.city, profile.country].filter(Boolean).join(", ") || "Non renseignée"}</dd></div>
                      <div><dt>Approuvée le</dt><dd>{formatDate(profile.approvedAt)}</dd></div>
                    </dl>
                    {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
                    {portfolioUrl ? (
                      <a
                        href={portfolioUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.externalLink}
                      >
                        Voir le portfolio
                        <ExternalLink size={14} aria-hidden />
                      </a>
                    ) : null}
                    <div className={styles.actions}>
                      <Button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={actionsLocked}
                        onClick={() => startEditing(profile)}
                      >
                        <Pencil size={16} aria-hidden />
                        Modifier
                      </Button>
                      <Button
                        type="button"
                        className={profile.status === "active" ? styles.dangerButton : styles.primaryButton}
                        disabled={actionsLocked}
                        aria-busy={isBusy}
                        onClick={() => void setStatus(
                          profile,
                          profile.status === "active" ? "inactive" : "active",
                        )}
                      >
                        <Power size={16} aria-hidden />
                        {isBusy
                          ? "Enregistrement…"
                          : profile.status === "active"
                            ? "Désactiver"
                            : "Activer"}
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
