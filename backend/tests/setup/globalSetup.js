import { MongoMemoryServer } from "mongodb-memory-server";

// Runs once per `vitest` run, in the main process: start a throwaway mongod
// and hand its URI to the test workers (read there with inject("mongoUri")).
export default async function setup(project) {
  const mongod = await MongoMemoryServer.create();
  project.provide("mongoUri", mongod.getUri());

  return async () => {
    await mongod.stop();
  };
}
