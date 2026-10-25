import express from "express";
import cors from "cors";
import incidentRoutes from "./routes/incidents.js";
import { notFound, errorHandler } from "./middleware/errors.js";

// The Express app only — no DB connection, no listening port. server.js starts
// it for real; tests import it directly (supertest) with an in-memory MongoDB.
const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/incidents", incidentRoutes);

// Must be last: unmatched routes -> 404, then every error -> JSON response
app.use(notFound);
app.use(errorHandler);

export default app;
