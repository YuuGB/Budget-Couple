import { useState, useEffect } from "react";
import { subscribeToAuthState, signIn, signUp, signOutUser } from "./firebase.js";
import BudgetApp from "./BudgetApp.jsx";

const fontImports = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');
`;

export default function AuthGate() {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((u) => {
      setUser(u);
      setChecking(false);
    });
    return () => unsubscribe();
  }, []);

  if (checking) {
    return (
      <div style={styles.loadingScreen}>
        <style>{fontImports}</style>
        <div>Chargement…</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <BudgetApp uid={user.uid} userEmail={user.email} onSignOut={() => signOutUser()} />;
}

function LoginScreen() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function friendlyError(code) {
    if (code === "auth/invalid-email") return "Adresse email invalide.";
    if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential")
      return "Email ou mot de passe incorrect.";
    if (code === "auth/email-already-in-use") return "Un compte existe déjà avec cet email.";
    if (code === "auth/weak-password") return "Le mot de passe doit faire au moins 6 caractères.";
    return "Une erreur est survenue. Réessayez.";
  }

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    if (!email.trim() || !password) {
      setError("Merci de remplir l'email et le mot de passe.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
      }
    } catch (err) {
      setError(friendlyError(err.code));
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.app}>
      <style>{fontImports}</style>
      <div style={styles.card}>
        <h1 style={styles.title}>Notre budget</h1>
        <p style={styles.subtitle}>
          {mode === "login" ? "Connectez-vous à votre espace." : "Créez un espace pour votre foyer."}
        </p>

        <form onSubmit={submit}>
          <label style={styles.fieldLabel}>Email</label>
          <input
            style={styles.input}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
          />

          <label style={styles.fieldLabel}>Mot de passe</label>
          <input
            style={styles.input}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          {error && <p style={styles.error}>{error}</p>}

          <button style={styles.submitBtn} type="submit" disabled={submitting}>
            {submitting ? "…" : mode === "login" ? "Se connecter" : "Créer mon espace"}
          </button>
        </form>

        <button
          style={styles.switchModeBtn}
          onClick={() => {
            setError("");
            setMode(mode === "login" ? "signup" : "login");
          }}
        >
          {mode === "login" ? "Pas encore de compte ? Créer un espace" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  app: {
    minHeight: "100vh",
    width: "100%",
    background: "#1C2333",
    color: "#E8DFC8",
    fontFamily: "'Inter', sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    boxSizing: "border-box",
  },
  loadingScreen: {
    minHeight: "100vh",
    background: "#1C2333",
    color: "#8A7F9E",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Inter', sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 380,
    background: "#232B42",
    borderRadius: 20,
    padding: "32px 24px",
    boxSizing: "border-box",
  },
  title: {
    fontFamily: "'Fraunces', serif",
    fontSize: 28,
    fontWeight: 500,
    margin: "0 0 6px",
  },
  subtitle: {
    fontSize: 13,
    color: "#A79FBB",
    margin: "0 0 24px",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#A79FBB",
    marginBottom: 6,
    marginTop: 14,
    display: "block",
  },
  input: {
    width: "100%",
    background: "#1C2333",
    border: "1px solid #2E3650",
    borderRadius: 10,
    padding: "12px 14px",
    color: "#E8DFC8",
    fontSize: 15,
    fontFamily: "'Inter', sans-serif",
    boxSizing: "border-box",
    outline: "none",
  },
  error: {
    color: "#E08E7D",
    fontSize: 13,
    marginTop: 10,
  },
  submitBtn: {
    width: "100%",
    marginTop: 24,
    padding: "13px 0",
    borderRadius: 10,
    border: "none",
    background: "#E8DFC8",
    color: "#1C2333",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  switchModeBtn: {
    width: "100%",
    marginTop: 16,
    padding: "8px 0",
    background: "none",
    border: "none",
    color: "#8FA3C4",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
};
