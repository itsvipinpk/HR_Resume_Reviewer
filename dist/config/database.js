"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeDatabase = exports.checkDatabaseHealth = exports.getResumesCollection = exports.getDatabase = exports.connectToDatabase = void 0;
const mongodb_1 = require("mongodb");
const env_1 = require("./env");
let client = null;
let db = null;
const connectToDatabase = async () => {
    if (db && client) {
        return db;
    }
    if (!env_1.ENV.MONGODB_URI) {
        throw new Error("MONGODB_URI is not defined in environment variables");
    }
    client = new mongodb_1.MongoClient(env_1.ENV.MONGODB_URI);
    await client.connect();
    db = client.db(env_1.ENV.MONGODB_DB_NAME);
    console.log(`Connected to MongoDB database: ${env_1.ENV.MONGODB_DB_NAME}`);
    return db;
};
exports.connectToDatabase = connectToDatabase;
const getDatabase = () => {
    if (!db) {
        throw new Error("Database not initialized. Call connectToDatabase() first.");
    }
    return db;
};
exports.getDatabase = getDatabase;
const getResumesCollection = async (collectionName = "resumes") => {
    const database = await (0, exports.connectToDatabase)();
    return database.collection(collectionName);
};
exports.getResumesCollection = getResumesCollection;
const checkDatabaseHealth = async () => {
    try {
        const startTime = Date.now();
        const database = await (0, exports.connectToDatabase)();
        await database.command({ ping: 1 });
        database.collection("resumes");
        const latencyMs = Date.now() - startTime;
        return { connected: true, latencyMs };
    }
    catch (err) {
        return { connected: false, error: err.message };
    }
};
exports.checkDatabaseHealth = checkDatabaseHealth;
const closeDatabase = async () => {
    if (client) {
        await client.close();
        client = null;
        db = null;
        console.log("MongoDB connection closed.");
    }
};
exports.closeDatabase = closeDatabase;
