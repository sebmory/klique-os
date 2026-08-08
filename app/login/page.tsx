"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState("/");
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next")?.trim() || "";
    setNextPath(next.startsWith("/") ? next : "/");
    setReason(params.get("reason"));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user, password }),
      });

      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setErrorMessage(payload.message || "Connexion impossible.");
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setErrorMessage("Connexion impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
      <section style={{ width: "100%", maxWidth: "380px", border: "1px solid #d4d4d8", borderRadius: "12px", padding: "20px", background: "#ffffff" }}>
        <h1 style={{ margin: 0, fontSize: "1.4rem" }}>Acces KLIQUE OS</h1>
        <p style={{ color: "#52525b", marginTop: "8px" }}>Authentification requise pour acceder a l application.</p>

        {reason === "config" ? (
          <p role="alert" style={{ color: "#b91c1c", marginTop: "8px" }}>
            Protection d acces non configuree sur le serveur.
          </p>
        ) : null}

        {errorMessage ? (
          <p role="alert" style={{ color: "#b91c1c", marginTop: "8px" }}>
            {errorMessage}
          </p>
        ) : null}

        <form onSubmit={submit} style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span>Utilisateur</span>
            <input
              type="text"
              value={user}
              onChange={(event) => setUser(event.target.value)}
              autoComplete="username"
              required
              style={{ border: "1px solid #d4d4d8", borderRadius: "8px", padding: "10px" }}
            />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span>Mot de passe</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              style={{ border: "1px solid #d4d4d8", borderRadius: "8px", padding: "10px" }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{ border: "none", borderRadius: "8px", padding: "11px", background: "#111827", color: "#ffffff", cursor: "pointer" }}
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </section>
    </main>
  );
}
