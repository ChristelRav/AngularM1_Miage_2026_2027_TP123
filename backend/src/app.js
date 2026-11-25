import express from "express";
import cors from "cors";
import multer from "multer";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { Acces } from "./models/Acces.js";
import { User } from "./models/User.js";
import { Track } from "./models/Track.js";
import { Category, CATEGORY_TYPES } from "./models/Category.js";
import { Friendship, orderedPair } from "./models/Friendship.js";
import { Playlist, PLAYLIST_NAME_MAX } from "./models/Playlist.js";
import { categoriesForTracks, parseCategoryIds } from "./models/Category.js";
import { CATEGORY_IMAGES_DIR } from "./seeds/categories.seed.js";

// Les fichiers audio restent sur le disque du serveur dans ce TP.
// MongoDB ne conserve que leurs métadonnées : titre, nom, taille, etc.
const UPLOADS = path.resolve("data/uploads");

try {
  // mkdirSync est utilisé au démarrage : l'application doit disposer de ce
  // dossier avant de pouvoir accepter le premier upload.
  fs.mkdirSync(UPLOADS, { recursive: true });
  console.log(`[startup] Dossier des uploads prêt : ${UPLOADS}`);
} catch (error) {
  console.error("[startup] Impossible de créer le dossier des uploads", error);
  throw error;
}

// Ce secret reste côté serveur. Il ne doit jamais être copié dans Angular.
const SECRET = process.env.JWT_SECRET || "tp1-development-secret";

// La taille maximale d'un fichier audio est de 25 Mo. Les fichiers plus gros
// sont refusés par Multer avant d'être écrits sur le disque.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Les types MIME autorisés correspondent aux formats demandés dans le sujet.
const allowed = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
]);
const allowedCovers = new Set(["image/jpeg", "image/png", "image/webp"]);

async function removeUploadedFiles(files, context) {
  for (const file of Object.values(files ?? {}).flat()) {
    const uploadedPath = path.join(UPLOADS, file.filename);
    try {
      await fsPromises.unlink(uploadedPath);
      console.log(`[${context}] Fichier temporaire supprimé : ${uploadedPath}`);
    } catch (error) {
      console.error(`[${context}] Impossible de supprimer le fichier ${uploadedPath}`, error);
    }
  }
}

/**
 * Valide une liste d'identifiants de catégories reçue du client : format
 * ObjectId puis existence de chaque catégorie active.
 * Retourne { categoryIds } ou { error } (message pour une réponse 400).
 */
async function validateCategoryIds(raw) {
  const categoryIds = parseCategoryIds(raw);
  if (!categoryIds) return { error: "Identifiant de catégorie invalide" };
  if (categoryIds.length) {
    const found = await Category.countDocuments({ _id: { $in: categoryIds }, isActive: true });
    if (found !== categoryIds.length) return { error: "Catégorie inconnue" };
  }
  return { categoryIds };
}

/**
 * Prépare des relations d'amitié pour la réponse HTTP : récupère le nom de
 * l'autre utilisateur de chaque relation en une seule requête.
 */
async function publicFriendships(friendships, viewerId) {
  const otherIds = friendships.map((friendship) => friendship.otherUserId(viewerId));
  const users = await User.find({ _id: { $in: otherIds } }).select("name");
  const usersById = new Map(users.map((user) => [user.id, user]));
  return friendships.map((friendship) => friendship.toPublicFor(viewerId, usersById));
}

/**
 * Accepte ou refuse une demande d'amitié. Seul le destinataire (l'utilisateur
 * de la relation qui n'est pas `requestedBy`) peut répondre, et seulement tant
 * que la demande est en attente. La mise à jour est faite en une seule requête
 * conditionnelle : deux réponses simultanées ne peuvent pas s'écraser.
 */
async function answerFriendRequest(req, res, next, status) {
  const label = status === "ACCEPTED" ? "acceptée" : "refusée";
  try {
    const me = req.auth.sub;
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      console.warn(`[friends] Identifiant de demande invalide : ${id}`);
      return res.status(400).json({ message: "Identifiant de demande invalide" });
    }

    const friendship = await Friendship.findOneAndUpdate(
      { _id: id, ...Friendship.involving(me), status: "PENDING", requestedBy: { $ne: me } },
      { $set: { status } },
      { new: true, runValidators: true },
    );

    if (!friendship) {
      // Explique pourquoi la mise à jour n'a pas eu lieu, sans révéler les demandes des autres.
      const existing = await Friendship.findOne({ _id: id, ...Friendship.involving(me) });
      if (!existing) {
        console.warn(`[friends] Demande ${id} inconnue pour ${me}`);
        return res.status(404).json({ message: "Demande d'amitié inconnue" });
      }
      if (existing.status !== "PENDING") {
        console.warn(`[friends] Demande ${id} déjà traitée (${existing.status})`);
        return res.status(409).json({ message: "Cette demande a déjà été traitée" });
      }
      console.warn(`[friends] ${me} a tenté de répondre à sa propre demande ${id}`);
      return res.status(403).json({ message: "Seul le destinataire peut répondre à cette demande" });
    }

    console.log(`[friends] Demande ${friendship.id} ${label} par ${me}`);
    const [publicFriendship] = await publicFriendships([friendship], me);
    res.json(publicFriendship);
  } catch (error) {
    console.error(`[friends] Erreur : demande non ${label}`, error);
    next(error);
  }
}

/** Identifiants des amis (relations ACCEPTED) d'un utilisateur. */
async function friendIdsOf(userId) {
  const friendships = await Friendship.find({ ...Friendship.involving(userId), status: "ACCEPTED" }).select(
    "user1Id user2Id",
  );
  return new Set(friendships.map((friendship) => String(friendship.otherUserId(userId))));
}

/** Vérifie et nettoie le nom d'une playlist. Retourne { name } ou { error }. */
function parsePlaylistName(raw) {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return { error: "Le nom de la playlist est requis" };
  if (name.length > PLAYLIST_NAME_MAX) {
    return { error: `Le nom de la playlist ne doit pas dépasser ${PLAYLIST_NAME_MAX} caractères` };
  }
  return { name };
}

/**
 * Charge la playlist :id et vérifie les droits de l'utilisateur connecté.
 * - Le propriétaire a tous les droits.
 * - Un invité doit être dans sharedWith ET toujours ami (Friendship ACCEPTED)
 *   avec le propriétaire : un ancien ami perd l'accès, même s'il est encore
 *   dans sharedWith. Il peut seulement consulter et écouter (`ownerOnly` → 403).
 * - Pour les autres, 404 : on ne révèle pas l'existence de la playlist.
 * Retourne { playlist, isOwner }, ou null quand la réponse d'erreur est déjà envoyée.
 */
async function findPlaylistFor(req, res, { ownerOnly }) {
  const me = req.auth.sub;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    console.warn(`[playlists] Identifiant de playlist invalide : ${id}`);
    res.status(400).json({ message: "Identifiant de playlist invalide" });
    return null;
  }

  const playlist = await Playlist.findById(id);
  const isOwner = playlist && String(playlist.ownerId) === me;
  const invited =
    playlist &&
    !isOwner &&
    playlist.sharedWith.some((userId) => String(userId) === me) &&
    (await friendIdsOf(me)).has(String(playlist.ownerId));

  if (!isOwner && !invited) {
    console.warn(`[playlists] Playlist ${id} inconnue ou non accessible pour ${me}`);
    res.status(404).json({ message: "Playlist inconnue" });
    return null;
  }
  if (ownerOnly && !isOwner) {
    console.warn(`[playlists] ${me} (invité) a tenté de modifier la playlist ${id}`);
    res.status(403).json({ message: "Seul le propriétaire peut modifier cette playlist" });
    return null;
  }
  return { playlist, isOwner };
}

/**
 * Prépare des playlists pour la réponse HTTP, en 2 requêtes au total : les
 * pistes (pour le nombre et les pochettes) et le nom des propriétaires.
 * Les références vers des pistes supprimées sont ignorées.
 * Avec `withTracks`, ajoute le détail des pistes dans l'ordre de trackIds.
 */
async function publicPlaylists(playlists, viewerId, { withTracks = false } = {}) {
  const tracks = await Track.find({ _id: { $in: playlists.flatMap((playlist) => playlist.trackIds) } }).select(
    "+coverStoredName",
  );
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  const owners = await User.find({ _id: { $in: playlists.map((playlist) => playlist.ownerId) } }).select("name");
  const ownersById = new Map(owners.map((owner) => [owner.id, owner.name]));

  return playlists.map((playlist) => {
    const isOwner = String(playlist.ownerId) === String(viewerId);
    const playlistTracks = playlist.trackIds.map((id) => tracksById.get(String(id))).filter(Boolean);
    // Fichiers servis par les routes de la playlist : elles marchent aussi pour les invités.
    const fileUrl = (track, file) => `/api/playlists/${playlist.id}/tracks/${track.id}/${file}`;
    return {
      id: playlist.id,
      name: playlist.name,
      owner: { id: String(playlist.ownerId), name: ownersById.get(String(playlist.ownerId)) ?? "Utilisateur supprimé" },
      isOwner,
      trackIds: playlistTracks.map((track) => track.id),
      trackCount: playlistTracks.length,
      // Jusqu'à 4 pochettes pour la mosaïque de la carte.
      covers: playlistTracks
        .filter((track) => track.coverStoredName)
        .slice(0, 4)
        .map((track) => fileUrl(track, "cover")),
      // Seul le propriétaire voit avec combien de personnes la playlist est partagée.
      ...(isOwner ? { sharedWithCount: playlist.sharedWith.length } : {}),
      ...(withTracks
        ? {
            tracks: playlistTracks.map((track) => ({
              id: track.id,
              title: track.title,
              originalName: track.originalName,
              mimeType: track.mimeType,
              size: track.size,
              createdAt: track.createdAt,
              coverUrl: track.coverStoredName ? fileUrl(track, "cover") : null,
              audioUrl: fileUrl(track, "audio"),
            })),
          }
        : {}),
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
    };
  });
}

/**
 * Crée un jeton JWT contenant uniquement l'identité nécessaire à l'API.
 * Le mot de passe n'est jamais placé dans le token. `sub` signifie subject
 * et contient l'identifiant MongoDB de l'utilisateur.
 */
function token(user) {
  console.log(`[auth] Création d'un token pour l'utilisateur ${user.id}`);
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, {
    expiresIn: "2h",
  });
}

/** Middleware Express qui protège les routes privées. */
function auth(req, res, next) {
  const raw = req.headers.authorization;

  // Le token est transmis dans l'en-tête Authorization sous la forme
    // "Authorization: Bearer <token>". Le préfixe "Bearer " est obligatoire pour que
    // le middleware sache qu'il s'agit d'un JWT et non d'un autre type de jeton.
  if (!raw?.startsWith("Bearer ")) {
    console.warn(`[auth] Authorization absente pour ${req.method} ${req.path}`);
    return res.status(401).json({ message: "Authentification requise" });
  }

  try {
    // jwt.verify vérifie la signature et la date d'expiration du token.
    // On ne logue jamais sa valeur, car un JWT permettrait une usurpation.
    req.auth = jwt.verify(raw.slice(7), SECRET);
    console.log(`[auth] Token accepté pour ${req.auth.sub}`);
    next();
  } catch (error) {
    console.error("[auth] Token invalide ou expiré", error);
    return res.status(401).json({ message: "Jeton invalide ou expiré" });
  }
}

/*
 * Multer transforme une requête HTTP multipart/form-data en données exploitables
 * par Express et traite les fichiers envoyés par un formulaire HTML.
 * Documentation officielle : https://github.com/expressjs/multer
 *
 * diskStorage indique que Multer écrit directement le fichier sur disque.
 * Chaque callback doit appeler cb(error, value) : null signifie qu'il n'y a
 * pas d'erreur. Le nom aléatoire évite les collisions entre utilisateurs.
 */
const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    console.debug(`[multer] Destination sélectionnée : ${UPLOADS}`);
    callback(null, UPLOADS);
  },
  filename: (_request, file, callback) => {
    const filename =
      crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
    console.log(`[multer] Nom de stockage généré pour ${file.originalname}`);
    callback(null, filename);
  },
});

/*
 * limits.fileSize protège le serveur contre les fichiers trop volumineux.
 * fileFilter est appelé avant l'enregistrement : accepter le fichier appelle
 * callback(null, true), le refuser transmet une vraie Error à Express.
 */
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_request, file, callback) => {
    const acceptedTypes = file.fieldname === "cover" ? allowedCovers : allowed;
    if (acceptedTypes.has(file.mimetype)) {
      console.log(`[multer] Type accepté pour ${file.fieldname} : ${file.mimetype}`);
      return callback(null, true);
    }

    const error = new Error(
      file.fieldname === "cover" ? "Format image non accepté" : "Format audio non accepté",
    );
    console.error(`[multer] Type refusé : ${file.mimetype}`, error);
    return callback(error);
  },
});

/**
 * Construit l'application Express sans ouvrir de port.
 * Cette séparation permet au serveur réel et aux tests de créer la même
 * application. Le port est ouvert uniquement dans server.js.
 */
export function createApp() {
  const app = express();

  // Journaliser la fin de chaque requête permet de suivre méthode, URL,
  // statut et durée sans exposer les corps contenant des mots de passe.
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      console.log(
        `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt} ms)`,
      );
    });
    next();
  });

  // CORS est nécessaire pour que le frontend Angular puisse appeler l'API.
  // C'est-à-dire que le navigateur autorise les requêtes cross-origin depuis localhost:4200.
  // Dans un vrai projet, il est recommandé de limiter les origines autorisées.
  app.use(cors());

  // Express ne gère pas nativement le JSON : ce middleware transforme le corps JSON en objet JavaScript 
  // accessible via req.body.
  // Il est placé avant les routes pour que toutes les requêtes JSON soient traitées.
  app.use(express.json());

  // Images des catégories : publiques (une balise <img> n'envoie pas le JWT).
  // Seul ce sous-dossier est exposé ; les fichiers audio et couvertures restent
  // accessibles uniquement par les routes authentifiées.
  app.use("/uploads/categories", express.static(CATEGORY_IMAGES_DIR, { index: false }));

  /** Endpoint public utilisé pour vérifier que l'API répond. */
  app.get("/api/health", (_req, res) => {
    console.log("[health] Vérification de l'API");
    res.json({ status: "ok" });
  });

  /** Requête POST pour "insertion" de donnée.
   * Inscrit un utilisateur et renvoie un token avec ses données publiques. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
   */
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { name, email, password } = req.body || {};
      console.log(`[auth] Tentative d'inscription pour ${email || "email absent"}`);

      if (!name || !email || !password || password.length < 8) {
        console.warn("[auth] Inscription refusée : données invalides ou incomplètes");
        return res.status(400).json({
          message: "Nom, email et mot de passe de 8 caractères requis",
        });
      }

      // Vérifie si l'email est déjà utilisé avant de créer un nouvel utilisateur.
      if (await User.exists({ email: String(email).toLowerCase() })) {
        console.warn(`[auth] Email déjà utilisé : ${email}`);
        return res.status(409).json({ message: "Email déjà utilisé" });
      }

      // Crée l'utilisateur et le stocke dans MongoDB. Le mot de passe est haché
      // par le hook pre('validate') défini dans le schéma Mongoose.
      const user = await User.create({ name, email, password });
      console.log(`[auth] Utilisateur créé : ${user.id}`);
      res.status(201).json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant l'inscription", error);
      next(error);
    }
  });

  /** Vérifie les identifiants et ouvre une session JWT. Les identifiants sont envoyés dans le corps de la 
   * requête par un HTTP POST. */
  app.post("/api/auth/login", async (req, res, next) => {
    try {
        // req.body est déjà un objet JavaScript grâce au middleware express.json() placé plus haut.
        // il contient les champs email et password envoyés par le frontend Angular.
      const email = String(req.body?.email || "").toLowerCase();
      console.log(`[auth] Tentative de connexion pour ${email || "email absent"}`);

      // Sélectionne le mot de passe haché pour vérifier les identifiants.
      // User est un modèle Mongoose qui correspond au schéma défini dans models/User.js.
      // on envoie les requête à MongoDB via cet objet. Le mot de passe haché est stocké dans 
      // passwordHash, mais il n'est pas renvoyé par défaut dans les requêtes pour 
      // des raisons de sécurité.
      const user = await User.findOne({ email }).select("+passwordHash");

      if (!user || !(await user.verifyPassword(req.body?.password || ""))) {
        console.warn(`[auth] Identifiants incorrects pour ${email}`);
        return res.status(401).json({ message: "Identifiants incorrects" });
      }

      console.log(`[auth] Connexion réussie : ${user.id}`);
      res.json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant la connexion", error);
      next(error);
    }
  });

  /** Retourne le profil public de l'utilisateur identifié par le JWT. 
   * Les paramètres sont :
   * @param auth - Le middleware qui vérifie le JWT et ajoute req.auth. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
  */
  app.get("/api/users/me", auth, async (req, res, next) => {
    try {
        // req.auth.sub contient l'identifiant MongoDB de l'utilisateur 
        // extrait du JWT par le middleware auth. ici req.auth est un objet ajouté par le middleware 
        // auth à la requête, et sub est la propriété qui contient l'identifiant de l'utilisateur.
      const user = await User.findById(req.auth.sub);
      if (!user) {
        console.warn(`[user] Profil introuvable : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Profil envoyé : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de lecture du profil", error);
      next(error);
    }
  });

  /** Modifie uniquement le nom de l'utilisateur connecté. */
  app.put("/api/users/me", auth, async (req, res, next) => {
    try {
      const user = await User.findByIdAndUpdate(
        req.auth.sub,
        { $set: { name: req.body?.name } },
        { new: true, runValidators: true },
      );

      if (!user) {
        console.warn(`[user] Mise à jour impossible : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Nom mis à jour : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de mise à jour du profil", error);
      next(error);
    }
  });

  /** Retourne une page des pistes appartenant exclusivement à l'utilisateur. */
  app.get("/api/acces", auth, async (_req, res, next) => {
    try {
      const acces = await Acces.find().sort({ accesName: 1 });
      res.json(acces.map((item) => item.toPublic()));
    } catch (error) {
      console.error("[acces] Erreur de lecture des accès", error);
      next(error);
    }
  });

  app.post("/api/acces", auth, async (req, res, next) => {
    try {
      const accesName =
        typeof req.body?.accesName === "string" ? req.body.accesName.trim() : "";
      if (!accesName) {
        return res.status(400).json({ message: "Le nom de l'accès est requis" });
      }

      const acces = await Acces.create({ accesName });

      res.status(201).json(acces.toPublic());
    } catch (error) {
      console.error("[acces] Erreur de création d'un accès", error);
      next(error);
    }
  });

  /** Liste les catégories actives, toutes ou filtrées par type (?type=GENRE|MOOD|THEME). */
  app.get("/api/categories", auth, async (req, res, next) => {
    try {
      const filter = { isActive: true };
      if (req.query.type !== undefined) {
        const type = String(req.query.type).toUpperCase();
        if (!CATEGORY_TYPES.includes(type)) {
          console.warn(`[categories] Type inconnu : ${req.query.type}`);
          return res.status(400).json({ message: "Type de catégorie invalide (GENRE, MOOD ou THEME)" });
        }
        filter.type = type;
      }

      const categories = await Category.find(filter).sort({ type: 1, name: 1 });
      console.log(`[categories] ${categories.length} catégorie(s) envoyée(s)`);
      res.json(categories.map((category) => category.toPublic()));
    } catch (error) {
      console.error("[categories] Erreur de lecture des catégories", error);
      next(error);
    }
  });

  /** Retourne les catégories d'une piste appartenant à l'utilisateur. */
  app.get("/api/tracks/:id/categories", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Identifiant de piste invalide" });
      }
      const track = await Track.findOne({ _id: req.params.id, ownerId: req.auth.sub })
        .select("categoryIds")
        .lean();
      if (!track) {
        console.warn(`[categories] Piste introuvable ou interdite : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const byTrack = await categoriesForTracks([track]);
      res.json(byTrack.get(String(track._id)));
    } catch (error) {
      console.error("[categories] Erreur de lecture des catégories d'une piste", error);
      next(error);
    }
  });

  /** Remplace toutes les catégories d'une piste ({ categoryIds: [] } les retire toutes). */
  app.put("/api/tracks/:id/categories", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Identifiant de piste invalide" });
      }
      if (!Array.isArray(req.body?.categoryIds)) {
        return res.status(400).json({ message: "categoryIds doit être un tableau" });
      }
      const { categoryIds, error } = await validateCategoryIds(req.body.categoryIds);
      if (error) {
        console.warn(`[categories] Modification refusée : ${error}`);
        return res.status(400).json({ message: error });
      }
      // Seul le tableau categoryIds de la piste est remplacé.
      const track = await Track.findOneAndUpdate(
        { _id: req.params.id, ownerId: req.auth.sub },
        { $set: { categoryIds } },
        { new: true, runValidators: true },
      )
        .select("categoryIds")
        .lean();
      if (!track) {
        console.warn(`[categories] Piste introuvable ou interdite : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const byTrack = await categoriesForTracks([track]);
      console.log(`[categories] ${categoryIds.length} catégorie(s) pour la piste ${req.params.id}`);
      res.json(byTrack.get(String(track._id)));
    } catch (error) {
      console.error("[categories] Erreur de modification des catégories", error);
      next(error);
    }
  });

  app.get("/api/tracks", auth, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
      const filter = { ownerId: req.auth.sub };

      console.log(`[tracks] Lecture page=${page}, limit=${limit}, user=${req.auth.sub}`);

      // La lecture des pistes et le comptage total sont parallélisés pour réduire la latence.
      // on utilise Promise.all pour exécuter les deux opérations en parallèle. 
      // Track.find() récupère les pistes de l'utilisateur avec pagination, 
      // tandis que Track.countDocuments() compte le nombre total de pistes pour cet utilisateur.
      // Promise.all attend que les deux opérations soient terminées avant de continuer et les résultats
        // sont stockés dans les variables items et total.
      const [items, total] = await Promise.all([
        Track.find(filter)
          .populate("accesId", "accesName")
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .select("-storedName -coverStoredName")
          .lean(),
        Track.countDocuments(filter),
      ]);

      // Catégories de toutes les pistes de la page en une seule fois.
      // Les anciennes pistes sans categoryIds reçoivent un tableau vide.
      const categoriesByTrack = await categoriesForTracks(items);

      // items.map(track) crée un nouveau tableau publicItems en transformant chaque piste pour inclure 
      // uniquement les champs nécessaires à l'API.
      // L'identifiant MongoDB (_id) est converti en chaîne de caractères (id) pour être plus lisible 
      // côté frontend.
      // Le champ _id (généré par MongoDB) est supprimé pour éviter de l'exposer dans la réponse JSON.
      const publicItems = items.map((track) => ({
        ...track,
        id: String(track._id),
        coverUrl: track.coverMimeType ? `/api/tracks/${String(track._id)}/cover` : null,
        accesId: track.accesId
          ? {
              _id: String(track.accesId._id),
              accesName: track.accesId.accesName,
            }
          : null,
        categoryIds: (track.categoryIds ?? []).map(String),
        categories: categoriesByTrack.get(String(track._id)) ?? [],
        _id: undefined,
      }));

      console.log(`[tracks] ${publicItems.length} piste(s) envoyée(s) sur ${total}`);

      // envoi de la réponse JSON avec les pistes publiques, la page actuelle, la limite par page, 
      // le nombre total de pistes et le nombre total de pages.
      res.json({
        items: publicItems,
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (error) {
      console.error("[tracks] Erreur de pagination", error);
      next(error);
    }
  });

  app.patch("/api/tracks/:id/access", auth, async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Identifiant de piste invalide" });
      }

      const accesId = req.body?.accesId;
      if (typeof accesId !== "string" || !mongoose.isValidObjectId(accesId)) {
        return res.status(400).json({ message: "Identifiant d'accès invalide" });
      }

      const acces = await Acces.findById(accesId).select("_id accesName");
      if (!acces) {
        return res.status(400).json({ message: "Accès inconnu" });
      }

      const track = await Track.findOneAndUpdate(
        { _id: req.params.id, ownerId: req.auth.sub },
        { $set: { accesId: acces._id } },
        { new: true, runValidators: true },
      ).populate("accesId", "accesName");

      if (!track) {
        return res.status(404).json({ message: "Piste inconnue" });
      }

      console.log(`[tracks] Accès de la piste ${track.id} mis à jour`);
      res.json(track.toPublic());
    } catch (error) {
      console.error("[tracks] Erreur de mise à jour de l'accès", error);
      next(error);
    }
  });

  /**
   * Reçoit les champs multipart audio, cover (facultatif) et le champ texte title.
   * Multer place les fichiers dans req.files et les champs texte dans req.body.
   * C'est ici qu'est fait l'upload de fichiers sur le serveur. 
   * Le middleware auth vérifie le JWT avant d'accepter l'upload.
   * Le middleware traite les fichiers audio et de couverture envoyés par le formulaire.
   * Si le fichier est accepté, il est stocké sur le disque et ses métadonnées sont enregistrées 
   * dans MongoDB.
   */
  app.post(
    "/api/tracks",
    auth,
    upload.fields([
      { name: "audio", maxCount: 1 },
      { name: "cover", maxCount: 1 },
    ]),
    async (req, res, next) => {
      try {
        const audioFile = req.files?.audio?.[0];
        const coverFile = req.files?.cover?.[0];
        if (!audioFile) {
          await removeUploadedFiles(req.files, "tracks");
          console.warn(`[tracks] Upload sans fichier par ${req.auth.sub}`);
          return res.status(400).json({ message: "Fichier audio requis" });
        }

        let accesId;
        if (req.body.accesId !== undefined) {
          if (
            typeof req.body.accesId !== "string" ||
            !mongoose.isValidObjectId(req.body.accesId)
          ) {
            await removeUploadedFiles(req.files, "tracks");
            return res.status(400).json({ message: "Identifiant d'accès invalide" });
          }

          accesId = req.body.accesId;
          if (!(await Acces.exists({ _id: accesId }))) {
            await removeUploadedFiles(req.files, "tracks");
            return res.status(400).json({ message: "Accès inconnu" });
          }
        }

        // categoryIds est facultatif : champ multipart répété, un par catégorie.
        const { categoryIds, error: categoryError } = await validateCategoryIds(
          req.body.categoryIds,
        );
        if (categoryError) {
          await removeUploadedFiles(req.files, "tracks");
          console.warn(`[tracks] Upload refusé : ${categoryError}`);
          return res.status(400).json({ message: categoryError });
        }

        const track = await Track.create({
          ownerId: req.auth.sub,
          ...(accesId && { accesId }),
          title: req.body.title || audioFile.originalname,
          originalName: audioFile.originalname,
          storedName: audioFile.filename,
          mimeType: audioFile.mimetype,
          size: audioFile.size,
          categoryIds,
          ...(coverFile && {
            coverStoredName: coverFile.filename,
            coverMimeType: coverFile.mimetype,
          }),
        });

        const categoriesByTrack = await categoriesForTracks([track]);

        await track.populate("accesId", "accesName");
        console.log(
          `[tracks] Upload enregistré : ${track.id} (${categoryIds.length} catégorie(s))`,
        );
        res.status(201).json({
          ...track.toPublic(),
          categories: categoriesByTrack.get(track.id) ?? [],
        });
      } catch (error) {
        console.error("[tracks] Erreur après l'enregistrement du fichier", error);

        // Si MongoDB échoue après l'écriture sur disque, on tente de nettoyer
        // le fichier orphelin. L'erreur de nettoyage est elle aussi loguée.
        await removeUploadedFiles(req.files, "tracks");
        next(error);
      }
    },
  );

  /** Envoie l'image de couverture d'une piste après vérification de sa propriété. */
  app.get("/api/tracks/:id/cover", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+coverStoredName");

      if (!track?.coverStoredName) {
        console.warn(`[tracks] Couverture introuvable ou interdite : ${req.params.id}`);
        return res.status(404).json({ message: "Couverture inconnue" });
      }

      const coverPath = path.join(UPLOADS, track.coverStoredName);
      res.type(track.coverMimeType);
      res.sendFile(coverPath, (error) => {
        if (error) {
          console.error(`[tracks] Erreur d'envoi de la couverture ${track.id}`, error);
          if (!res.headersSent) next(error);
          return;
        }
        console.log(`[tracks] Couverture envoyée : ${track.id}`);
      });
    } catch (error) {
      console.error("[tracks] Erreur de préparation de la couverture", error);
      next(error);
    }
  });

  /** Envoie le contenu binaire d'une piste après vérification de sa propriété. */
  app.get("/api/tracks/:id/audio", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!track) {
        console.warn(`[tracks] Audio introuvable ou interdit : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      res.type(track.mimeType);
      // Ce callback permet de loguer le succès ou l'erreur du transfert.
      res.sendFile(audioPath, (error) => {
        if (error) {
          console.error(`[tracks] Erreur d'envoi audio ${track.id}`, error);
          if (!res.headersSent) next(error);
          return;
        }
        console.log(`[tracks] Audio envoyé : ${track.id}`);
      });
    } catch (error) {
      console.error("[tracks] Erreur de préparation du flux audio", error);
      next(error);
    }
  });

  /** Supprime la métadonnée et le fichier physique correspondant. */
  app.delete("/api/tracks/:id", auth, async (req, res, next) => {
    try {
      const track = await Track.findOneAndDelete({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName +coverStoredName");

      if (!track) {
        console.warn(`[tracks] Suppression impossible : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      // La piste n'existe plus : elle est retirée des playlists qui la contenaient.
      const playlists = await Playlist.updateMany({ trackIds: track._id }, { $pull: { trackIds: track._id } });
      if (playlists.modifiedCount) {
        console.log(`[tracks] Piste ${track.id} retirée de ${playlists.modifiedCount} playlist(s)`);
      }

      const storedFiles = [track.storedName, track.coverStoredName].filter(Boolean);
      const failedFiles = [];
      for (const storedName of storedFiles) {
        const storedPath = path.join(UPLOADS, storedName);
        try {
          await fsPromises.unlink(storedPath);
          console.log(`[tracks] Fichier supprimé : ${storedPath}`);
        } catch (error) {
          failedFiles.push(storedPath);
          console.error(`[tracks] Fichier non supprimé : ${storedPath}`, error);
        }
      }
      if (failedFiles.length) {
        return res.status(500).json({
          message: "Métadonnée supprimée, mais un ou plusieurs fichiers associés non supprimés",
        });
      }

      res.status(204).end();
    } catch (error) {
      console.error("[tracks] Erreur de suppression", error);
      next(error);
    }
  });

  /*
   * Amitiés. Une seule relation par couple d'utilisateurs (voir models/Friendship.js).
   * L'utilisateur connecté est toujours celui du JWT (req.auth.sub) : il ne peut
   * envoyer, lire, accepter ou refuser que les demandes qui le concernent.
   */

  /** Envoie une demande d'amitié à un utilisateur désigné par son email (ou son id). */
  app.post("/api/friendships", auth, async (req, res, next) => {
    try {
      const me = req.auth.sub;
      const { email, userId } = req.body || {};
      let target;

      if (userId !== undefined) {
        if (!mongoose.isValidObjectId(userId)) {
          console.warn(`[friends] Identifiant d'utilisateur invalide envoyé par ${me}`);
          return res.status(400).json({ message: "Identifiant d'utilisateur invalide" });
        }
        target = await User.findById(userId);
      } else if (typeof email === "string" && email.trim()) {
        target = await User.findOne({ email: email.trim().toLowerCase() });
      } else {
        console.warn(`[friends] Demande sans destinataire envoyée par ${me}`);
        return res.status(400).json({ message: "Email de l'utilisateur requis" });
      }

      if (!target) {
        console.warn(`[friends] Destinataire inconnu pour la demande de ${me}`);
        return res.status(404).json({ message: "Aucun utilisateur avec cet email" });
      }
      if (target.id === me) {
        console.warn(`[friends] ${me} a tenté de s'envoyer une demande`);
        return res.status(400).json({ message: "Vous ne pouvez pas vous envoyer une demande d'amitié" });
      }

      // Vérifie la relation existante, dans un sens comme dans l'autre (couple ordonné).
      let friendship = await Friendship.findOne(orderedPair(me, target.id));
      if (friendship?.status === "ACCEPTED") {
        console.warn(`[friends] ${me} et ${target.id} sont déjà amis`);
        return res.status(409).json({ message: "Vous êtes déjà amis" });
      }
      if (friendship?.status === "PENDING") {
        const sentByMe = String(friendship.requestedBy) === me;
        console.warn(`[friends] Demande déjà en attente entre ${me} et ${target.id}`);
        return res.status(409).json({
          message: sentByMe
            ? "Demande déjà envoyée, en attente de réponse"
            : "Cet utilisateur vous a déjà envoyé une demande : répondez-y depuis vos notifications",
        });
      }

      if (friendship) {
        // Demande refusée auparavant : elle peut être renvoyée, la relation est réutilisée.
        friendship.status = "PENDING";
        friendship.requestedBy = me;
        await friendship.save();
        console.log(`[friends] Demande renvoyée : ${friendship.id} (${me} -> ${target.id})`);
      } else {
        friendship = await Friendship.create({ user1Id: me, user2Id: target.id, requestedBy: me });
        console.log(`[friends] Demande créée : ${friendship.id} (${me} -> ${target.id})`);
      }

      res.status(201).json(friendship.toPublicFor(me, new Map([[target.id, target]])));
    } catch (error) {
      // Deux demandes simultanées pour le même couple : l'index unique refuse la seconde.
      if (error?.code === 11000) {
        console.warn("[friends] Relation déjà créée par une requête simultanée", error);
        return res.status(409).json({ message: "Une relation existe déjà avec cet utilisateur" });
      }
      console.error("[friends] Erreur d'envoi de la demande", error);
      next(error);
    }
  });

  /** Demandes reçues en attente (celles affichées dans les notifications). */
  app.get("/api/friendships/received", auth, async (req, res, next) => {
    try {
      const me = req.auth.sub;
      const friendships = await Friendship.find({
        ...Friendship.involving(me),
        status: "PENDING",
        requestedBy: { $ne: me },
      }).sort({ createdAt: -1 });
      console.log(`[friends] ${friendships.length} demande(s) reçue(s) pour ${me}`);
      res.json(await publicFriendships(friendships, me));
    } catch (error) {
      console.error("[friends] Erreur de lecture des demandes reçues", error);
      next(error);
    }
  });

  /** Demandes envoyées par l'utilisateur et toujours en attente. */
  app.get("/api/friendships/sent", auth, async (req, res, next) => {
    try {
      const me = req.auth.sub;
      const friendships = await Friendship.find({ requestedBy: me, status: "PENDING" }).sort({ createdAt: -1 });
      console.log(`[friends] ${friendships.length} demande(s) envoyée(s) par ${me}`);
      res.json(await publicFriendships(friendships, me));
    } catch (error) {
      console.error("[friends] Erreur de lecture des demandes envoyées", error);
      next(error);
    }
  });

  app.patch("/api/friendships/:id/accept", auth, (req, res, next) =>
    answerFriendRequest(req, res, next, "ACCEPTED"),
  );
  app.patch("/api/friendships/:id/reject", auth, (req, res, next) =>
    answerFriendRequest(req, res, next, "REJECTED"),
  );

  /** Liste des amis (relations acceptées) de l'utilisateur connecté. */
  app.get("/api/friends", auth, async (req, res, next) => {
    try {
      const me = req.auth.sub;
      const friendships = await Friendship.find({ ...Friendship.involving(me), status: "ACCEPTED" }).sort({
        updatedAt: -1,
      });
      const friends = (await publicFriendships(friendships, me)).map((friendship) => ({
        id: friendship.user.id,
        name: friendship.user.name,
        friendshipId: friendship.id,
        since: friendship.updatedAt,
      }));
      console.log(`[friends] ${friends.length} ami(s) pour ${me}`);
      res.json(friends);
    } catch (error) {
      console.error("[friends] Erreur de lecture de la liste d'amis", error);
      next(error);
    }
  });

  /*
   * Playlists. Le propriétaire gère tout (nom, musiques, partage, suppression).
   * Un ami invité (sharedWith + Friendship ACCEPTED) peut seulement consulter et
   * écouter. Les droits sont vérifiés par findPlaylistFor() sur chaque route :id.
   */

  /** Playlists de l'utilisateur connecté. */
  app.get("/api/playlists", auth, async (req, res, next) => {
    try {
      const me = req.auth.sub;
      const playlists = await Playlist.find({ ownerId: me }).sort({ updatedAt: -1 });
      console.log(`[playlists] ${playlists.length} playlist(s) pour ${me}`);
      res.json(await publicPlaylists(playlists, me));
    } catch (error) {
      console.error("[playlists] Erreur de lecture des playlists", error);
      next(error);
    }
  });

  /** Crée une playlist, vide au départ. */
  app.post("/api/playlists", auth, async (req, res, next) => {
    try {
      const me = req.auth.sub;
      const { name, error } = parsePlaylistName(req.body?.name);
      if (error) {
        console.warn(`[playlists] Création refusée pour ${me} : ${error}`);
        return res.status(400).json({ message: error });
      }
      const playlist = await Playlist.create({ ownerId: me, name });
      console.log(`[playlists] Playlist créée : ${playlist.id} par ${me}`);
      const [publicPlaylist] = await publicPlaylists([playlist], me, { withTracks: true });
      res.status(201).json(publicPlaylist);
    } catch (error) {
      console.error("[playlists] Erreur de création de la playlist", error);
      next(error);
    }
  });

  /**
   * Playlists partagées avec l'utilisateur connecté. Celles dont le propriétaire
   * n'est plus son ami ne sont pas renvoyées (l'accès est perdu).
   */
  app.get("/api/playlists/shared", auth, async (req, res, next) => {
    try {
      const me = req.auth.sub;
      const friendIds = await friendIdsOf(me);
      const playlists = (await Playlist.find({ sharedWith: me }).sort({ updatedAt: -1 })).filter((playlist) =>
        friendIds.has(String(playlist.ownerId)),
      );
      console.log(`[playlists] ${playlists.length} playlist(s) partagée(s) avec ${me}`);
      res.json(await publicPlaylists(playlists, me));
    } catch (error) {
      console.error("[playlists] Erreur de lecture des playlists partagées", error);
      next(error);
    }
  });

  /** Contenu d'une playlist (propriétaire ou ami invité), pistes dans l'ordre de trackIds. */
  app.get("/api/playlists/:id", auth, async (req, res, next) => {
    try {
      const access = await findPlaylistFor(req, res, { ownerOnly: false });
      if (!access) return;
      const [publicPlaylist] = await publicPlaylists([access.playlist], req.auth.sub, { withTracks: true });
      console.log(`[playlists] Playlist ${access.playlist.id} envoyée à ${req.auth.sub}`);
      res.json(publicPlaylist);
    } catch (error) {
      console.error("[playlists] Erreur de lecture de la playlist", error);
      next(error);
    }
  });

  /** Renomme une playlist (propriétaire seulement). */
  app.patch("/api/playlists/:id", auth, async (req, res, next) => {
    try {
      const access = await findPlaylistFor(req, res, { ownerOnly: true });
      if (!access) return;
      const { name, error } = parsePlaylistName(req.body?.name);
      if (error) {
        console.warn(`[playlists] Nom refusé pour ${access.playlist.id} : ${error}`);
        return res.status(400).json({ message: error });
      }
      access.playlist.name = name;
      await access.playlist.save();
      console.log(`[playlists] Playlist ${access.playlist.id} renommée`);
      const [publicPlaylist] = await publicPlaylists([access.playlist], req.auth.sub, { withTracks: true });
      res.json(publicPlaylist);
    } catch (error) {
      console.error("[playlists] Erreur de renommage de la playlist", error);
      next(error);
    }
  });

  /** Supprime une playlist. Les pistes et leurs fichiers audio ne sont pas touchés. */
  app.delete("/api/playlists/:id", auth, async (req, res, next) => {
    try {
      const access = await findPlaylistFor(req, res, { ownerOnly: true });
      if (!access) return;
      await access.playlist.deleteOne();
      console.log(`[playlists] Playlist ${access.playlist.id} supprimée (pistes conservées)`);
      res.status(204).end();
    } catch (error) {
      console.error("[playlists] Erreur de suppression de la playlist", error);
      next(error);
    }
  });

  /** Ajoute une piste du propriétaire à la fin de la playlist, sans doublon. */
  app.post("/api/playlists/:id/tracks", auth, async (req, res, next) => {
    try {
      const access = await findPlaylistFor(req, res, { ownerOnly: true });
      if (!access) return;
      const { trackId } = req.body || {};
      if (!mongoose.isValidObjectId(trackId)) {
        console.warn(`[playlists] Identifiant de piste invalide pour ${access.playlist.id}`);
        return res.status(400).json({ message: "Identifiant de musique invalide" });
      }
      // La musique doit exister et appartenir au propriétaire de la playlist.
      if (!(await Track.exists({ _id: trackId, ownerId: req.auth.sub }))) {
        console.warn(`[playlists] Piste ${trackId} inconnue pour ${req.auth.sub}`);
        return res.status(404).json({ message: "Musique inconnue" });
      }
      // Condition « pas encore présente » + $push dans la même requête : pas de doublon possible.
      const updated = await Playlist.findOneAndUpdate(
        { _id: access.playlist._id, trackIds: { $ne: trackId } },
        { $push: { trackIds: trackId } },
        { new: true },
      );
      if (!updated) {
        console.warn(`[playlists] Piste ${trackId} déjà dans ${access.playlist.id}`);
        return res.status(409).json({ message: "Cette musique est déjà dans la playlist" });
      }
      console.log(`[playlists] Piste ${trackId} ajoutée à ${updated.id}`);
      const [publicPlaylist] = await publicPlaylists([updated], req.auth.sub, { withTracks: true });
      res.status(201).json(publicPlaylist);
    } catch (error) {
      console.error("[playlists] Erreur d'ajout d'une musique", error);
      next(error);
    }
  });

  /** Retire une piste de la playlist (la piste elle-même n'est pas supprimée). */
  app.delete("/api/playlists/:id/tracks/:trackId", auth, async (req, res, next) => {
    try {
      const access = await findPlaylistFor(req, res, { ownerOnly: true });
      if (!access) return;
      const { trackId } = req.params;
      if (!mongoose.isValidObjectId(trackId)) {
        return res.status(400).json({ message: "Identifiant de musique invalide" });
      }
      const result = await Playlist.updateOne(
        { _id: access.playlist._id, trackIds: trackId },
        { $pull: { trackIds: trackId } },
      );
      if (!result.modifiedCount) {
        console.warn(`[playlists] Piste ${trackId} absente de ${access.playlist.id}`);
        return res.status(404).json({ message: "Cette musique n'est pas dans la playlist" });
      }
      console.log(`[playlists] Piste ${trackId} retirée de ${access.playlist.id}`);
      res.status(204).end();
    } catch (error) {
      console.error("[playlists] Erreur de retrait d'une musique", error);
      next(error);
    }
  });

  /** Fichier audio ou pochette d'une piste de la playlist, pour le propriétaire et les amis invités. */
  app.get("/api/playlists/:id/tracks/:trackId/:file", auth, async (req, res, next) => {
    try {
      const { trackId, file } = req.params;
      // Express 5 n'accepte plus de motif dans le chemin : seuls « audio » et « cover » existent.
      if (!["audio", "cover"].includes(file)) {
        return res.status(404).json({ message: "Ressource inconnue" });
      }
      const access = await findPlaylistFor(req, res, { ownerOnly: false });
      if (!access) return;
      const inPlaylist = access.playlist.trackIds.some((id) => String(id) === trackId);
      const track = inPlaylist
        ? await Track.findOne({ _id: trackId, ownerId: access.playlist.ownerId }).select(
            "+storedName +coverStoredName",
          )
        : null;
      const storedName = file === "audio" ? track?.storedName : track?.coverStoredName;
      if (!storedName) {
        console.warn(`[playlists] ${file} de ${trackId} indisponible dans ${access.playlist.id}`);
        return res.status(404).json({ message: file === "audio" ? "Piste inconnue" : "Couverture inconnue" });
      }

      res.type(file === "audio" ? track.mimeType : track.coverMimeType);
      res.sendFile(path.join(UPLOADS, storedName), (error) => {
        if (error) {
          console.error(`[playlists] Erreur d'envoi (${file}) de ${track.id}`, error);
          if (!res.headersSent) next(error);
          return;
        }
        console.log(`[playlists] ${file} de ${track.id} envoyé pour ${access.playlist.id}`);
      });
    } catch (error) {
      console.error("[playlists] Erreur de préparation du fichier", error);
      next(error);
    }
  });

  /**
   * Amis ayant accès à la playlist (propriétaire seulement). Les utilisateurs
   * qui ne sont plus amis sont retirés de sharedWith à cette occasion.
   */
  app.get("/api/playlists/:id/shares", auth, async (req, res, next) => {
    try {
      const access = await findPlaylistFor(req, res, { ownerOnly: true });
      if (!access) return;
      const { playlist } = access;
      const friendIds = await friendIdsOf(req.auth.sub);
      const formerFriends = playlist.sharedWith.filter((id) => !friendIds.has(String(id)));
      if (formerFriends.length) {
        await Playlist.updateOne({ _id: playlist._id }, { $pull: { sharedWith: { $in: formerFriends } } });
        console.log(`[playlists] ${formerFriends.length} ancien(s) ami(s) retiré(s) du partage de ${playlist.id}`);
      }
      const users = await User.find({
        _id: { $in: playlist.sharedWith.filter((id) => friendIds.has(String(id))) },
      }).select("name");
      res.json(users.map((user) => ({ id: user.id, name: user.name })));
    } catch (error) {
      console.error("[playlists] Erreur de lecture du partage", error);
      next(error);
    }
  });

  /** Partage la playlist avec un ou plusieurs amis : { userIds: [...] }. */
  app.post("/api/playlists/:id/shares", auth, async (req, res, next) => {
    try {
      const access = await findPlaylistFor(req, res, { ownerOnly: true });
      if (!access) return;
      const me = req.auth.sub;
      const raw = req.body?.userIds;
      if (!Array.isArray(raw) || !raw.length || !raw.every((id) => mongoose.isValidObjectId(id))) {
        console.warn(`[playlists] Partage refusé : userIds invalide pour ${access.playlist.id}`);
        return res.status(400).json({ message: "Liste d'amis invalide" });
      }
      const userIds = [...new Set(raw.map(String))];
      if (userIds.includes(me)) {
        console.warn(`[playlists] ${me} a tenté de partager ${access.playlist.id} avec lui-même`);
        return res.status(400).json({ message: "Impossible de partager une playlist avec soi-même" });
      }
      const friendIds = await friendIdsOf(me);
      if (!userIds.every((id) => friendIds.has(id))) {
        console.warn(`[playlists] Partage de ${access.playlist.id} refusé : destinataire non ami`);
        return res.status(400).json({ message: "Le partage est réservé à vos amis" });
      }
      // $addToSet : un ami déjà présent n'est pas ajouté une deuxième fois.
      await Playlist.updateOne({ _id: access.playlist._id }, { $addToSet: { sharedWith: { $each: userIds } } });
      console.log(`[playlists] Playlist ${access.playlist.id} partagée avec ${userIds.length} ami(s)`);
      const playlist = await Playlist.findById(access.playlist._id);
      const users = await User.find({ _id: { $in: playlist.sharedWith } }).select("name");
      res.json(users.map((user) => ({ id: user.id, name: user.name })));
    } catch (error) {
      console.error("[playlists] Erreur de partage de la playlist", error);
      next(error);
    }
  });

  /** Retire l'accès d'un utilisateur à la playlist. */
  app.delete("/api/playlists/:id/shares/:userId", auth, async (req, res, next) => {
    try {
      const access = await findPlaylistFor(req, res, { ownerOnly: true });
      if (!access) return;
      const { userId } = req.params;
      if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ message: "Identifiant d'utilisateur invalide" });
      }
      const result = await Playlist.updateOne(
        { _id: access.playlist._id, sharedWith: userId },
        { $pull: { sharedWith: userId } },
      );
      if (!result.modifiedCount) {
        console.warn(`[playlists] ${userId} n'a pas accès à ${access.playlist.id}`);
        return res.status(404).json({ message: "Cet utilisateur n'a pas accès à la playlist" });
      }
      console.log(`[playlists] Accès de ${userId} retiré de ${access.playlist.id}`);
      res.status(204).end();
    } catch (error) {
      console.error("[playlists] Erreur de retrait d'un accès", error);
      next(error);
    }
  });

  /** Gestionnaire central des erreurs connues de l'application. */
  app.use((error, _req, res, next) => {
    console.error("[error] Erreur reçue par le gestionnaire central", error);

    if (
      error instanceof multer.MulterError ||
      error?.message === "Format audio non accepté" ||
      error?.message === "Format image non accepté"
    ) {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Un accès avec cette valeur existe déjà" });
    }
    if (error?.name === "CastError") {
      return res.status(404).json({ message: "Ressource inconnue" });
    }

    next(error);
  });

  return app;
}
