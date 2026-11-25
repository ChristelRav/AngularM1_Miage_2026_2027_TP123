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
| GET | `/categories?type=GENRE` | JWT ; `type` facultatif (`GENRE`, `MOOD`, `THEME`) | `200 Category[]` actives, triées par type puis nom |
| GET | `/tracks/:id/categories` | JWT | `200 Category[]` de la piste (`[]` si aucune) |
| PUT | `/tracks/:id/categories` | `{categoryIds: string[]}` + JWT | `200 Category[]` après remplacement |
| GET | `/uploads/categories/<slug>.jpg` (hors `/api`) | public | image de la catégorie, `404` si absente |
| POST | `/friendships` | `{email}` (ou `{userId}`) + JWT | `201 Friendship` envoyée |
| GET | `/friendships/received` | JWT | `200 Friendship[]` reçues en attente (`PENDING`) |
| GET | `/friendships/sent` | JWT | `200 Friendship[]` envoyées en attente (`PENDING`) |
| PATCH | `/friendships/:id/accept` | JWT | `200 Friendship` acceptée |
| PATCH | `/friendships/:id/reject` | JWT | `200 Friendship` refusée |
| GET | `/friends` | JWT | `200 Friend[]`, amis de l'utilisateur |

`Page<Track>` contient `items`, `page`, `limit`, `total` et `pages`. Formats audio acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum. L'image facultative `cover` accepte JPEG, PNG ou WebP ; `Track.coverUrl` vaut `null` pour les pistes sans couverture.

`Acces` contient `_id` (ObjectId généré par MongoDB et exposé en chaîne) et `accesName` (obligatoire et unique). Les accès `privé`, `public` et `friendly` sont préparés au démarrage avec leurs ObjectId générés automatiquement. `Track.accesId` référence directement l'`_id` MongoDB d'un accès. Dans le multipart de création d'une piste, `accesId` est facultatif : s'il est absent, l'accès privé est attribué; s'il est fourni, il doit être un ObjectId valide d'un accès existant. Dans les réponses tracks, `accesId` est l'objet peuplé `{_id, accesName}` ou `null` pour les anciennes pistes sans relation (ou dont l'accès n'existe plus). La commande `npm run migrate:tracks-access` (depuis `backend`) attribue l'accès privé uniquement aux tracks historiques sans `accesId`; elle ne modifie pas les autres associations.

La route `PATCH /tracks/:id/access` vérifie l'ObjectId de la piste et de l'accès, puis confirme que l'accès existe. Elle ne modifie que `Track.accesId` et n'autorise que le propriétaire de la piste. Le corps est `{ "accesId": "<ObjectId>" }`; la réponse `200` contient le `Track` avec son accès peuplé. Erreurs : `400` identifiant invalide ou accès inconnu, `401` authentification requise, `404` piste inconnue ou appartenant à un autre utilisateur.

### Catégories musicales

`Category` contient `_id`, `name`, `slug` (unique, ex. `r-and-b`), `type` (`GENRE`, `MOOD` ou `THEME`), `parentId` (`_id` de la catégorie parente ou `null`, ex. Métal → Rock), `description`, `image: {url, alt}` et `isActive`. MongoDB ne stocke que le chemin de l'image (`/uploads/categories/<slug>.jpg`) ; le fichier est dans `backend/data/uploads/categories/`. Les 52 catégories par défaut sont insérées au démarrage du backend, identifiées par leur `slug` : un redémarrage ne crée pas de doublon.

Une piste peut avoir zéro, une ou plusieurs catégories, et une catégorie peut être utilisée par plusieurs pistes. Les identifiants sont stockés directement dans le document de la piste : `tracks.categoryIds` (tableau d'ObjectId, `[]` par défaut). Il n'y a pas de collection de liaison. Dans les réponses, `Track.categoryIds` (tableau de chaînes) est toujours présent, y compris pour les anciennes pistes (`[]`). `GET /tracks` et `POST /tracks` ajoutent `Track.categories` : les catégories actives correspondantes, avec leur nom, type et image, pour l'affichage. La suppression d'une piste supprime donc aussi ses catégories.

La commande `npm run migrate:track-categories` (depuis `backend`, option `--dry-run` pour simuler) copie les associations de l'ancienne collection `trackcategories` dans `tracks.categoryIds`, vérifie la copie, puis supprime `trackcategories`. Elle peut être relancée sans effet.

- `POST /tracks` : champ multipart `categoryIds` facultatif, répété une fois par catégorie. Erreur `400` « Identifiant de catégorie invalide » ou « Catégorie inconnue » (les fichiers reçus sont alors supprimés).
- `GET /categories` : `400` si `type` n'est pas `GENRE`, `MOOD` ou `THEME` (insensible à la casse) ; `401` sans JWT.
- `GET /tracks/:id/categories` : `400` identifiant invalide ; `401` ; `404` piste inconnue ou appartenant à un autre utilisateur.
- `PUT /tracks/:id/categories` : corps `{ "categoryIds": ["<ObjectId>", ...] }`, qui remplace toutes les catégories de la piste (`[]` les retire toutes). Erreurs : `400` si `categoryIds` n'est pas un tableau, si un identifiant est invalide ou si une catégorie est inconnue/inactive ; `401` ; `404` piste inconnue ou appartenant à un autre utilisateur.
- `GET /uploads/categories/<fichier>` : route publique (une balise `<img>` n'envoie pas le JWT), limitée à ce dossier. Les fichiers audio et couvertures restent accessibles uniquement par les routes authentifiées.

### Amitiés

Collection `friendships` : `{_id, user1Id, user2Id, requestedBy, status, createdAt, updatedAt}`, avec `status` égal à `PENDING`, `ACCEPTED` ou `REJECTED`. Le couple est enregistré dans un ordre fixe (`user1Id` < `user2Id`) et un index unique `{user1Id, user2Id}` garantit **une seule relation par couple d'utilisateurs**, quel que soit celui qui envoie la demande. `requestedBy` est l'expéditeur. Toutes les routes utilisent l'utilisateur du JWT : on ne peut lire ou modifier que les relations dont on fait partie.

`Friendship` (réponse) : `{id, status, direction, user: {id, name}, createdAt, updatedAt}`. `direction` vaut `SENT` ou `RECEIVED` du point de vue de l'utilisateur connecté ; `user` est toujours **l'autre** utilisateur (nom seulement, son email n'est pas renvoyé). `Friend` : `{id, name, friendshipId, since}`.

- `POST /friendships` : corps `{ "email": "ami@exemple.com" }` (ou `{ "userId": "<ObjectId>" }`). Erreurs : `400` destinataire absent, identifiant invalide ou demande à soi-même ; `401` ; `404` « Aucun utilisateur avec cet email » ; `409` si les deux utilisateurs sont déjà amis, si une demande est déjà en attente dans un sens ou dans l'autre. Une demande **refusée** peut être renvoyée : la même relation repasse en `PENDING` avec le nouvel expéditeur. Une demande **acceptée** ne peut pas être renvoyée.
- `GET /friendships/received` : demandes `PENDING` dont l'utilisateur est le destinataire, les plus récentes d'abord (utilisées par la cloche de notification). `GET /friendships/sent` : demandes `PENDING` envoyées par l'utilisateur.
- `PATCH /friendships/:id/accept` et `PATCH /friendships/:id/reject` : sans corps. Seul le **destinataire** d'une demande `PENDING` peut y répondre. Erreurs : `400` identifiant invalide ; `401` ; `403` l'expéditeur tente de répondre à sa propre demande ; `404` demande inconnue ou dont l'utilisateur ne fait pas partie ; `409` demande déjà traitée.
- `GET /friends` : relations `ACCEPTED` de l'utilisateur, triées de la plus récente à la plus ancienne.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` valeur déjà utilisée.
