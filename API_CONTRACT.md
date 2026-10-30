# Contrat HTTP - TP1

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/acces` | JWT | `200 Acces[]`, triés par nom |
| POST | `/acces` | `{accesName}` + JWT | `201 Acces` |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title`, `cover` et `accesId` (facultatifs) | `201 Track` |
| PATCH | `/tracks/:id/access` | `{accesId}` + JWT | `200 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| GET | `/tracks/:id/cover` | JWT | image de couverture (404 si absente) |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) |

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`. Formats audio acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum. L'image facultative `cover` accepte JPEG, PNG ou WebP ; `Track.coverUrl` vaut `null` pour les pistes sans couverture.

`Acces` contient `_id` (ObjectId généré par MongoDB et exposé en chaîne) et `accesName` (obligatoire et unique). Les accès `privé`, `public` et `friendly` sont préparés au démarrage avec leurs ObjectId générés automatiquement. `Track.accesId` référence directement l'`_id` MongoDB d'un accès. Dans le multipart de création d'une piste, `accesId` est facultatif : s'il est absent, l'accès privé est attribué; s'il est fourni, il doit être un ObjectId valide d'un accès existant. Dans les réponses tracks, `accesId` est l'objet peuplé `{_id, accesName}` ou `null` pour les anciennes pistes sans relation (ou dont l'accès n'existe plus). La commande `npm run migrate:tracks-access` (depuis `backend`) attribue l'accès privé uniquement aux tracks historiques sans `accesId`; elle ne modifie pas les autres associations.

La route `PATCH /tracks/:id/access` vérifie l'ObjectId de la piste et de l'accès, puis confirme que l'accès existe. Elle ne modifie que `Track.accesId` et n'autorise que le propriétaire de la piste. Le corps est `{ "accesId": "<ObjectId>" }`; la réponse `200` contient le `Track` avec son accès peuplé. Erreurs : `400` identifiant invalide ou accès inconnu, `401` authentification requise, `404` piste inconnue ou appartenant à un autre utilisateur.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` valeur déjà utilisée.
