import mongoose from "mongoose";
import { migrateTracksWithoutAcces } from "../migrations/migrate-tracks-access.js";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI manque dans backend/.env");
}

try {
  await mongoose.connect(uri);
  const result = await migrateTracksWithoutAcces();
  console.log(
    `[migration] Accès privé ${result.accesId}; ${result.modifiedCount} track(s) mis à jour sur ${result.matchedCount}.`,
  );
} catch (error) {
  console.error("[migration] Échec de l'attribution de l'accès privé", error);
  process.exitCode = 1;
} finally {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
