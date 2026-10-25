import { randomUUID } from "node:crypto";
import { inject, beforeAll, afterEach, afterAll } from "vitest";
import mongoose from "mongoose";

// Set before any test file imports the app: anything that reads MONGODB_URI
// gets the in-memory server, never your real database.
process.env.MONGODB_URI = inject("mongoUri");

beforeAll(async () => {
  // A database of its own per test file, so files can run in parallel
  await mongoose.connect(process.env.MONGODB_URI, { dbName: `test-${randomUUID()}` });
});

// Every test starts from an empty database
afterEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
