import mongoose from "mongoose";

export const LEGACY_COLLECTION = "trackcategories";

/**
 * Copie les associations de l'ancienne collection `trackcategories` dans
 * `tracks.categoryIds`, vérifie la copie, puis supprime `trackcategories`.
 *
 * - `$addToSet` ajoute les catégories sans doublon et sans toucher aux autres champs.
 * - Le driver MongoDB est utilisé directement : `updatedAt` n'est pas modifié.
 * - Les pistes sans `categoryIds` reçoivent un tableau vide.
 * - La collection n'est supprimée que si chaque association est retrouvée dans
 *   `tracks` et qu'aucune association ne pointe vers une piste inexistante.
 *
 * Avec `dryRun: true`, rien n'est écrit : la fonction compte seulement.
 */
export async function migrateTrackCategories({ db = mongoose.connection.db, dryRun = false } = {}) {
  const tracks = db.collection("tracks");
  const legacyExists = (await db.listCollections({ name: LEGACY_COLLECTION }).toArray()).length > 0;
  const links = legacyExists
    ? await db.collection(LEGACY_COLLECTION).find({}, { projection: { trackId: 1, categoryId: 1 } }).toArray()
    : [];

  // trackId -> categoryIds
  const byTrack = new Map();
  for (const link of links) {
    const key = String(link.trackId);
    if (!byTrack.has(key)) byTrack.set(key, { trackId: link.trackId, categoryIds: [] });
    byTrack.get(key).categoryIds.push(link.categoryId);
  }

  const existingTracks = await tracks
    .find({ _id: { $in: [...byTrack.values()].map((entry) => entry.trackId) } }, { projection: { _id: 1 } })
    .toArray();
  const existingIds = new Set(existingTracks.map((track) => String(track._id)));
  const orphanLinks = links.filter((link) => !existingIds.has(String(link.trackId))).length;

  let tracksUpdated = 0;
  let emptyArraysAdded = 0;
  if (!dryRun) {
    for (const [key, entry] of byTrack) {
      if (!existingIds.has(key)) continue;
      const result = await tracks.updateOne(
        { _id: entry.trackId },
        { $addToSet: { categoryIds: { $each: entry.categoryIds } } },
      );
      tracksUpdated += result.modifiedCount;
    }
    const result = await tracks.updateMany(
      { categoryIds: { $exists: false } },
      { $set: { categoryIds: [] } },
    );
    emptyArraysAdded = result.modifiedCount;
  }

  // Vérification : chaque association doit se retrouver dans tracks.categoryIds.
  const migratedTracks = await tracks
    .find({ _id: { $in: existingTracks.map((track) => track._id) } }, { projection: { categoryIds: 1 } })
    .toArray();
  const idsByTrack = new Map(
    migratedTracks.map((track) => [String(track._id), new Set((track.categoryIds ?? []).map(String))]),
  );
  const verifiedLinks = links.filter((link) =>
    idsByTrack.get(String(link.trackId))?.has(String(link.categoryId)),
  ).length;

  const verified = verifiedLinks === links.length && orphanLinks === 0;
  let legacyDropped = false;
  if (!dryRun && legacyExists && verified) {
    await db.collection(LEGACY_COLLECTION).drop();
    legacyDropped = true;
  }

  return {
    dryRun,
    legacyExists,
    links: links.length,
    tracksWithLinks: byTrack.size,
    orphanLinks,
    tracksUpdated,
    emptyArraysAdded,
    verifiedLinks,
    verified,
    legacyDropped,
  };
}
