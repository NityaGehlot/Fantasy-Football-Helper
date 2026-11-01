// app/backend/chatbotProxy.ts

import express from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { warmUpLLM } from "./services/llm";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = 4000;

// Register all routes
registerRoutes(app);

app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
  // Load the model now so the first chat question doesn't wait for it.
  warmUpLLM();
});
