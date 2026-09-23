import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import ProspectPassOrder from "@/components/pass/ProspectPassOrder";
import { buildJoinPassUrl, parsePublicPassPlanCode } from "@/lib/pass-navigation";
import styles from "@/components/pass/pass-flow.module.css";

type JoinPassPageProps = {
  searchParams: Promise<{ plan?: string | string[] }>;
};

export default async function JoinPassPage({ searchParams }: JoinPassPageProps) {
  const params = await searchParams;
  const planCode = parsePublicPassPlanCode(params.plan);
  const returnUrl = planCode ? buildJoinPassUrl(planCode) : "/join/pass";
  const { userId } = await auth();
  if (!userId) redirect(`/sign-up?redirect=${encodeURIComponent(returnUrl)}`);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/pass" className={styles.brand}>KLIQUE PASS</a>
        <span style={{ color: "#65716b", fontSize: "0.88rem" }}>Commande sécurisée</span>
      </header>
      <main className={styles.main}>
        <section style={{ marginBottom: "2rem" }} aria-labelledby="join-pass-title">
          <p className={styles.eyebrow}>Votre adhésion KLIQUE</p>
          <h1 id="join-pass-title" className={styles.title} style={{ fontSize: "clamp(2rem, 5vw, 3.8rem)" }}>Finaliser mon choix.</h1>
        </section>
        <ProspectPassOrder initialPlan={planCode} />
      </main>
    </div>
  );
}