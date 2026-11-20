import app from "./app";
import { ENV } from "./config/env";
import { connectToDatabase, closeDatabase } from "./config/database";

const startServer = async () => {
  try {
    await connectToDatabase();
  } catch (err) {
    console.warn("MongoDB connection deferred or failed on startup:", err);
  }

  const server = app.listen(ENV.PORT, () => {
    console.log(`Server running in ${ENV.NODE_ENV} mode on port ${ENV.PORT}`);
  });

  const handleShutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      try {
        await closeDatabase();
        console.log("Server closed successfully.");
        process.exit(0);
      } catch (err) {
        console.error("Error during graceful shutdown:", err);
        process.exit(1);
      }
    });
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  return server;
};

const serverPromise = startServer();

export default serverPromise;
