import mongoose from "mongoose";
import { Acces } from "./Acces.js";

/*
 * Ce schéma conserve les métadonnées d'une piste. Le fichier audio lui-même
 * reste sur le disque ; storedName contient le nom technique utilisé côté
 * serveur et n'est jamais exposé par toPublic().
 */
const schema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Acces",
    },
    title: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true, select: false },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    coverStoredName: { type: String, select: false },
    coverMimeType: { type: String },
  },
  { timestamps: true },
);

schema.pre("validate", async function () {
  if (this.isNew && this.accesId == null) {
    const privateAccess = await Acces.findOne({ accesName: "privé" }).select("_id");
    if (!privateAccess) {
      throw new Error("L'accès privé par défaut n'est pas configuré");
    }
    this.accesId = privateAccess._id;
  }
});

// Cet index accélère la liste des pistes d'un utilisateur triées par date.
schema.index({ ownerId: 1, createdAt: -1 });

/**
 * Convertit un document Mongoose en objet sûr pour le frontend.
 * L'identifiant MongoDB devient la propriété simple `id` attendue par Angular.
 */
schema.methods.toPublic = function () {
  console.debug(`[track-model] Préparation de la piste publique ${this.id}`);
  const acces = this.populated("accesId") ? this.accesId : null;
  return {
    id: this.id,
    ownerId: String(this.ownerId),
    title: this.title,
    originalName: this.originalName,
    mimeType: this.mimeType,
    size: this.size,
    createdAt: this.createdAt,
    coverUrl: this.coverStoredName ? `/api/tracks/${this.id}/cover` : null,
    accesId: acces
      ? {
          _id: String(acces._id),
          accesName: acces.accesName,
        }
      : null,
  };
};

export const Track = mongoose.model("Track", schema);
