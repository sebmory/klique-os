type ProductionNotesCardProps = {
  note: string;
};

export function ProductionNotesCard({ note }: ProductionNotesCardProps) {
  return (
    <article className="crm-person-card-shell">
      <header>
        <h2>Notes</h2>
      </header>
      {note ? (
        <p className="crm-person-notes-text">{note}</p>
      ) : (
        <div className="crm-person-empty-note crm-production-empty-note-compact">
          <p>Aucune note disponible pour cette production.</p>
        </div>
      )}
    </article>
  );
}
