import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import incidentRoutes from "./routes/incidents.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/incidents", incidentRoutes);

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(process.env.PORT || 5000, () =>
      console.log(`Server running on port ${process.env.PORT || 5000}`)
    );
  })
  .catch((err) => console.error("MongoDB connection error:", err));
