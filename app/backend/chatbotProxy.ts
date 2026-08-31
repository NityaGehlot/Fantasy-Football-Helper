// app/backend/chatbotProxy.ts

import express from "express";
import cors from "cors";
import { registerRoutes } from "./routes";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = 4000;

// Register all routes
registerRoutes(app);

app.listen(PORT, () =>
  console.log(`🚀 Backend running at http://localhost:${PORT}`)
);
