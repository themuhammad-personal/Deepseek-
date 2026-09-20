import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "Super DeepSeek", version: "1.0.0" });
});

// Serve static directories
app.use("/static", express.static(path.join(__dirname, "static")));
app.use("/docs", express.static(path.join(__dirname, "docs")));
if (path.join(__dirname, "dist-android")) {
  app.use("/dist-android", express.static(path.join(__dirname, "dist-android")));
}

// Serve root static files (favicon, etc.)
app.use(express.static(__dirname));

// SPA fallback to index.html
app.get("*all", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`⚡ Super DeepSeek server running on http://0.0.0.0:${PORT}`);
});
