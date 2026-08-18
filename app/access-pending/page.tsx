export default function AccessPendingPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "var(--color-bg, #f7f7f5)",
        color: "var(--color-text, #171717)",
      }}
    >
      <section style={{ width: "100%", maxWidth: "560px", textAlign: "center" }}>
        <h1 style={{ margin: "0 0 12px", fontSize: "28px", lineHeight: 1.2 }}>Accès KLIQUE en attente</h1>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          Votre accès KLIQUE n’est pas encore activé. Contactez un administrateur si vous pensez qu’il s’agit
          d’une erreur.
        </p>
      </section>
    </main>
  );
}