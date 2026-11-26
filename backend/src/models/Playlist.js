import mongoose from "mongoose";

export const PLAYLIST_NAME_MAX = 80;

/** Vrai si le tableau contient deux fois le même identifiant. */
function hasDuplicates(ids) {
  const values = (ids ?? []).map(String);
  return new Set(values).size !== values.length;
}

/*
 * Une playlist appartient à un utilisateur (ownerId). Elle contient des
 * références vers des pistes (trackIds, dans l'ordre de lecture) et la liste
 * des amis avec qui elle est partagée (sharedWith). Supprimer une playlist ne
 * touche ni aux documents Track ni aux fichiers audio : seules les références
 * disparaissent.
 */
const schema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: {
      type: String,
      required: [true, "Le nom de la playlist est requis"],
      trim: true,
      minlength: [1, "Le nom de la playlist est requis"],
      maxlength: [PLAYLIST_NAME_MAX, `Le nom de la playlist ne doit pas dépasser ${PLAYLIST_NAME_MAX} caractères`],
    },
    trackIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Track" }],
      default: [],
      validate: { validator: (ids) => !hasDuplicates(ids), message: "Une musique est en double dans la playlist" },
    },
    sharedWith: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
      validate: { validator: (ids) => !hasDuplicates(ids), message: "Un utilisateur est en double dans le partage" },
    },
  },
  { timestamps: true },
);

/** Le propriétaire ne peut pas être dans sa propre liste de partage. */
schema.pre("validate", function () {
  if (this.ownerId && (this.sharedWith ?? []).some((id) => id.equals(this.ownerId))) {
    this.invalidate("sharedWith", "Impossible de partager une playlist avec soi-même");
  }
});

// Playlists d'un utilisateur, les plus récemment modifiées d'abord.
schema.index({ ownerId: 1, updatedAt: -1 });
// Playlists partagées avec un utilisateur.
schema.index({ sharedWith: 1 });

export const Playlist = mongoose.model("Playlist", schema);
