import { Acces } from "../models/Acces.js";
import { Track } from "../models/Track.js";

export async function migrateTracksWithoutAcces({
  AccesModel = Acces,
  TrackModel = Track,
} = {}) {
  const privateAccess = await AccesModel.findOne({ accesName: "privé" }).select("_id");
  if (!privateAccess) {
    throw new Error(
      'Accès "privé" introuvable. Aucun track n’a été modifié; préparez d’abord les accès.',
    );
  }

  const result = await TrackModel.updateMany(
    {
      $or: [{ accesId: { $exists: false } }, { accesId: null }],
    },
    { $set: { accesId: privateAccess._id } },
  );

  return {
    accesId: String(privateAccess._id),
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
  };
}
