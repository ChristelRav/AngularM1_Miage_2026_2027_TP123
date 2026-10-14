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
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title`, `cover` (facultatif) | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| GET | `/tracks/:id/cover` | JWT | image de couverture (404 si absente) |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) |

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`. Formats audio acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum. L'image facultative `cover` accepte JPEG, PNG ou WebP ; `Track.coverUrl` vaut `null` pour les pistes sans couverture.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé.
