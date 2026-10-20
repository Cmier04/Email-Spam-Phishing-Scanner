
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Configure Vite to support React components and Tailwind CSS.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
