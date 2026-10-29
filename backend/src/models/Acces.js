import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    accesName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
  },
  { timestamps: true, collection: "acces" },
);

schema.methods.toPublic = function () {
  return {
    _id: String(this._id),
    accesName: this.accesName,
  };
};

export const Acces = mongoose.model("Acces", schema);

const DEFAULT_ACCES = [
  { accesName: "privé" },
  { accesName: "public" },
  { accesName: "friendly" },
];

export async function ensureDefaultAcces() {
  await Acces.init();

  const indexes = await Acces.collection.indexes();
  for (const index of indexes) {
    if (index.unique && index.key?.id === 1) {
      await Acces.collection.dropIndex(index.name);
      console.log(`[startup] Ancien index métier supprimé : ${index.name}`);
    }
  }

  for (const expected of DEFAULT_ACCES) {
    const result = await Acces.updateOne(
      { accesName: expected.accesName },
      { $setOnInsert: expected },
      { upsert: true },
    );
    if (result.upsertedCount) {
      console.log(`[startup] Accès préparé : ${expected.accesName}`);
    }
  }
}
