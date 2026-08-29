import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import Incident from "../models/Incident.js";
import { getEmbedding } from "../utils/embed.js";

dotenv.config();

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB. Seeding...");

  const raw = fs.readFileSync(new URL("./incidents.seed.json", import.meta.url));
  const incidents = JSON.parse(raw);

  await Incident.deleteMany({}); // clear old seed data first

  for (const inc of incidents) {
    const embedding = await getEmbedding(inc.description);
    await Incident.create({ ...inc, embedding });
    console.log(`Seeded: ${inc.title}`);
  }

  console.log(`Done. Seeded ${incidents.length} incidents.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
