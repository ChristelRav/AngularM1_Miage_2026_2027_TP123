import mongoose from "mongoose";
import { migrateTrackCategories } from "../migrations/migrate-track-categories.js";

const uri = process.env.MONGODB_URI;
// `--dry-run` : affiche ce qui serait migré sans rien écrire.
const dryRun = process.argv.includes("--dry-run");

if (!uri) {
  throw new Error("MONGODB_URI manque dans backend/.env");
}

try {
  await mongoose.connect(uri);
  const result = await migrateTrackCategories({ dryRun });
  console.log(`[migration] ${dryRun ? "Simulation (rien n'est écrit)" : "Migration des catégories"}`);
  console.log(
    `[migration] ${result.links} association(s) lue(s) pour ${result.tracksWithLinks} piste(s), ` +
      `${result.orphanLinks} vers une piste inexistante`,
  );
  if (!dryRun) {
    console.log(
      `[migration] ${result.tracksUpdated} piste(s) complétée(s), ` +
        `${result.emptyArraysAdded} piste(s) ont reçu categoryIds = []`,
    );
  }
  console.log(`[migration] ${result.verifiedLinks}/${result.links} association(s) présente(s) dans tracks.categoryIds`);

  if (!result.legacyExists) {
    console.log("[migration] La collection trackcategories n'existe pas : rien à supprimer");
  } else if (result.legacyDropped) {
    console.log("[migration] Vérification réussie : collection trackcategories supprimée");
  } else if (!dryRun) {
    console.error("[migration] Vérification incomplète : trackcategories est conservée");
    process.exitCode = 1;
  }
} catch (error) {
  console.error("[migration] Échec de la migration des catégories", error);
  process.exitCode = 1;
} finally {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
