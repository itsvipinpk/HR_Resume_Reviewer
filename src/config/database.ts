import { MongoClient, Db, Collection, Document } from "mongodb";
import { ENV } from "./env";

let client: MongoClient | null = null;
let db: Db | null = null;

export const connectToDatabase = async (): Promise<Db> => {
  if (db && client) {
    return db;
  }

  if (!ENV.MONGODB_URI) {
    throw new Error("MONGODB_URI is not defined in environment variables");
  }

  client = new MongoClient(ENV.MONGODB_URI);
  await client.connect();
  db = client.db(ENV.MONGODB_DB_NAME);
  console.log(`Connected to MongoDB database: ${ENV.MONGODB_DB_NAME}`);
  return db;
};

export const getDatabase = (): Db => {
  if (!db) {
    throw new Error("Database not initialized. Call connectToDatabase() first.");
  }
  return db;
};

export const getResumesCollection = async <T extends Document = any>(
  collectionName = "resumes"
): Promise<Collection<T>> => {
  const database = await connectToDatabase();
  return database.collection<T>(collectionName);
};

export const checkDatabaseHealth = async (): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> => {
  try {
    const startTime = Date.now();
    const database = await connectToDatabase();
    await database.command({ ping: 1 });
    database.collection("resumes");
    const latencyMs = Date.now() - startTime;
    return { connected: true, latencyMs };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
};

export const closeDatabase = async (): Promise<void> => {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("MongoDB connection closed.");
  }
};
