import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";
import tailwindcss from "@tailwindcss/vite";

// Netlify adapter is only needed for the live build, not for local `npm run dev`
const isDev = process.argv.includes("dev");

export default defineConfig({
  output: "server",
  adapter: isDev ? undefined : netlify(),
  vite: {
    plugins: [tailwindcss()],
  },
});