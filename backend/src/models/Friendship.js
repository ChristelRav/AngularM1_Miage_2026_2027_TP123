import mongoose from "mongoose";

export const FRIENDSHIP_STATUSES = ["PENDING", "ACCEPTED", "REJECTED"];

/**
 * Remet deux identifiants d'utilisateurs dans un ordre fixe (le plus petit en
 * premier). Ainsi, « A demande B » et « B demande A » donnent le même couple
 * {user1Id, user2Id}, et l'index unique empêche toute relation en double.
 */
export function orderedPair(a, b) {
  const [first, second] = [String(a), String(b)].sort();
  return { user1Id: first, user2Id: second };
}

/*
 * Une seule relation par couple d'utilisateurs, quel que soit son statut :
 * - PENDING : demande envoyée par `requestedBy`, en attente de l'autre ;
 * - ACCEPTED : les deux utilisateurs sont amis ;
 * - REJECTED : la demande a été refusée (elle peut être renvoyée plus tard).
 */
const schema = new mongoose.Schema(
  {
    user1Id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    user2Id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: FRIENDSHIP_STATUSES, default: "PENDING", required: true },
  },
  { timestamps: true },
);

/** Normalise l'ordre du couple, puis vérifie les règles métier avant chaque sauvegarde. */
schema.pre("validate", function () {
  if (this.user1Id && this.user2Id) {
    const { user1Id, user2Id } = orderedPair(this.user1Id, this.user2Id);
    this.user1Id = user1Id;
    this.user2Id = user2Id;
  }
  if (this.user1Id && this.user2Id && this.user1Id.equals(this.user2Id)) {
    this.invalidate("user2Id", "Un utilisateur ne peut pas s'envoyer une demande d'amitié");
  }
  if (this.requestedBy && !this.involves(this.requestedBy)) {
    this.invalidate("requestedBy", "requestedBy doit être l'un des deux utilisateurs");
  }
});

// Unicité du couple (déjà ordonné) : une seule relation entre deux utilisateurs.
schema.index({ user1Id: 1, user2Id: 1 }, { unique: true });
// Recherches fréquentes : relations d'un utilisateur selon le statut.
schema.index({ user1Id: 1, status: 1 });
schema.index({ user2Id: 1, status: 1 });

/** Vrai si l'utilisateur fait partie de la relation. */
schema.methods.involves = function (userId) {
  return [String(this.user1Id), String(this.user2Id)].includes(String(userId));
};

/** Identifiant de l'autre utilisateur de la relation. */
schema.methods.otherUserId = function (userId) {
  return String(this.user1Id) === String(userId) ? this.user2Id : this.user1Id;
};

/** Filtre MongoDB : relations dont l'utilisateur fait partie. */
schema.statics.involving = function (userId) {
  return { $or: [{ user1Id: userId }, { user2Id: userId }] };
};

/**
 * Données renvoyées au client, du point de vue de `viewerId` : l'autre
 * utilisateur (nom seulement, jamais son email) et le sens de la demande.
 */
schema.methods.toPublicFor = function (viewerId, usersById) {
  const otherId = String(this.otherUserId(viewerId));
  const other = usersById.get(otherId);
  return {
    id: this.id,
    status: this.status,
    direction: String(this.requestedBy) === String(viewerId) ? "SENT" : "RECEIVED",
    user: { id: otherId, name: other?.name ?? "Utilisateur supprimé" },
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const Friendship = mongoose.model("Friendship", schema);
