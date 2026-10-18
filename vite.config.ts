import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Na GitHub Pages aplikacija živi na /WareHouse/, a na Firebase Hosting-u na korenu.
export default defineConfig({
  base: process.env.GH_PAGES ? "/WareHouse/" : "/",
  plugins: [react()]
});
