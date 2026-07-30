import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT : remplace "budget-couple" par le nom EXACT de ton dépôt GitHub
// si tu le nommes différemment. Ce chemin doit correspondre à l'URL finale :
// https://TON-PSEUDO.github.io/budget-couple/
export default defineConfig({
  plugins: [react()],
  base: "/budget-couple/",
});
