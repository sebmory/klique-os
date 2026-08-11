import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_45%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] px-6 py-12">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl backdrop-blur">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/10 text-lg font-semibold text-cyan-300">
            KO
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-white">KLIQUE OS</h1>
          <p className="mt-2 text-sm text-slate-400">Activation du compte</p>
        </div>

        <div className="flex justify-center">
          <SignUp
            path="/sign-up"
            routing="path"
            forceRedirectUrl="/athlete"
            fallbackRedirectUrl="/athlete"
            appearance={{
              variables: {
                colorPrimary: "#22d3ee",
                colorBackground: "transparent",
                borderRadius: "0.75rem",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
