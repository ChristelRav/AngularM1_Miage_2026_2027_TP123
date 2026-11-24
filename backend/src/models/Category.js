import mongoose from "mongoose";

export const CATEGORY_TYPES = ["GENRE", "MOOD", "THEME"];

/*
 * Une catégorie musicale (genre, ambiance ou thème). L'image n'est pas stockée
 * dans MongoDB : seul son chemin public (ex. /uploads/categories/pop.jpg) est
 * conservé, le fichier restant dans backend/data/uploads/categories/.
 */
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    type: { type: String, required: true, enum: CATEGORY_TYPES, index: true },
    // Catégorie parente facultative, par exemple Rock pour le sous-genre Métal.
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    description: { type: String, trim: true, default: "" },
    image: {
      url: { type: String, trim: true, default: "" },
      alt: { type: String, trim: true, default: "" },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** Champs exposés au frontend. */
schema.methods.toPublic = function () {
  return categoryToPublic(this);
};

/** Même conversion pour un document Mongoose ou un objet issu de `.lean()`. */
export function categoryToPublic(category) {
  return {
    _id: String(category._id),
    name: category.name,
    slug: category.slug,
    type: category.type,
    parentId: category.parentId ? String(category.parentId) : null,
    description: category.description ?? "",
    image: {
      url: category.image?.url ?? "",
      alt: category.image?.alt ?? "",
    },
    isActive: category.isActive,
  };
}

export const Category = mongoose.model("Category", schema);

/**
 * Normalise la liste d'identifiants reçue (JSON ou champ multipart répété).
 * Retourne un tableau sans doublons, ou null si une valeur n'est pas un ObjectId.
 */
export function parseCategoryIds(raw) {
  if (raw === undefined || raw === null || raw === "") return [];
  const values = Array.isArray(raw) ? raw : [raw];
  if (!values.every((value) => typeof value === "string" && mongoose.isValidObjectId(value))) {
    return null;
  }
  return [...new Set(values)];
}

/**
 * Retourne une Map idPiste -> catégories publiques (actives, triées par type
 * puis par nom), en une seule requête pour toutes les pistes d'une page.
 * Une piste sans `categoryIds` (ancienne piste) reçoit un tableau vide.
 */
export async function categoriesForTracks(tracks) {
  const result = new Map(tracks.map((track) => [String(track._id), []]));
  const allIds = [...new Set(tracks.flatMap((track) => (track.categoryIds ?? []).map(String)))];
  if (!allIds.length) return result;

  const categories = await Category.find({ _id: { $in: allIds }, isActive: true })
    .sort({ type: 1, name: 1 })
    .lean();

  for (const track of tracks) {
    const ids = new Set((track.categoryIds ?? []).map(String));
    result.set(
      String(track._id),
      categories.filter((category) => ids.has(String(category._id))).map(categoryToPublic),
    );
  }
  return result;
}
