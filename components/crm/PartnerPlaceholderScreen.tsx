"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PartnerService } from "@/services/partner.service";
import type { Partner } from "@/types/partner";

type PartnerPlaceholderScreenProps = {
  id: string;
};

const toSlug = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "partenaire";

const stablePartnerId = (partner: Partner): string => partner.id?.trim() || toSlug(partner.name);

export function PartnerPlaceholderScreen({ id }: PartnerPlaceholderScreenProps) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadPartners = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await PartnerService.list();
        if (!active) return;
        setPartners(response.partners);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Impossible de charger ce partenaire.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPartners();

    return () => {
      active = false;
    };
  }, []);

  const partner = useMemo(
    () => partners.find((item) => stablePartnerId(item) === id) ?? null,
    [id, partners]
  );

  if (loading) {
    return (
      <section className="crm-partner-placeholder">
        <p>Chargement du partenaire...</p>
      </section>
    );
  }

  if (errorMessage || !partner) {
    return (
      <section className="crm-partner-placeholder">
        <h1>Partenaire introuvable</h1>
        <p>{errorMessage ?? "Aucun partenaire ne correspond a cette URL."}</p>
        <Link href="/crm/partenaires">Retour aux partenaires</Link>
      </section>
    );
  }

  return (
    <section className="crm-partner-placeholder">
      <h1>{partner.name}</h1>
      <p>{partner.category || "Categorie non renseignee"}</p>
      <Link href="/crm/partenaires">Retour aux partenaires</Link>
    </section>
  );
}
