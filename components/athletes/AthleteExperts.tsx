"use client";

import { useState } from "react";
import type { Partner } from "@/types/partner";

export function AthleteExperts({ expertPartners }: { expertPartners: Partner[] }) {
  const [selectedExpert, setSelectedExpert] = useState<Partner | null>(null);

  return (
    <>
      <article className="panel">
        <p className="eyebrow">Experts KLIQUE</p>
        {expertPartners.length > 0 ? (
          <div className="expert-list">
            {expertPartners.map((partner) => (
              <button
                type="button"
                key={partner.id}
                className="expert-card"
                onClick={() => setSelectedExpert(partner)}
              >
                <div>
                  <h4>{partner.name}</h4>
                  <small>{partner.category}</small>
                </div>
                <span>Voir</span>
              </button>
            ))}
          </div>
        ) : (
          <p>Aucun expert lié à cet athlète.</p>
        )}
      </article>

      {selectedExpert && (
        <section className="panel expert-detail-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Fiche expert</p>
              <h3>{selectedExpert.name}</h3>
            </div>
            <button className="secondary-button" onClick={() => setSelectedExpert(null)}>
              Fermer
            </button>
          </div>
          <div className="expert-detail-grid">
            <div><span>Catégorie</span><strong>{selectedExpert.category}</strong></div>
            <div><span>Contact</span><strong>{selectedExpert.contact}</strong></div>
            <div><span>E-mail</span><strong>{selectedExpert.email}</strong></div>
            <div><span>Téléphone</span><strong>{selectedExpert.phone}</strong></div>
            <div><span>Instagram</span><strong>{selectedExpert.instagram}</strong></div>
            <div><span>Statut</span><strong>{selectedExpert.status}</strong></div>
            <div className="wide-field"><span>Description</span><p>{selectedExpert.description || "—"}</p></div>
            <div className="wide-field"><span>Bénéfices</span><p>{selectedExpert.benefits || "—"}</p></div>
            <div className="wide-field"><span>Notes</span><p>{selectedExpert.notes || "—"}</p></div>
          </div>
        </section>
      )}
    </>
  );
}
