# Rapport d'usage de l'IA - TP1

## Mission : repérer l'architecture Angular et le flux de connexion

### Objectif

Retrouver dans le frontend le composant racine, la configuration des routes, l'enregistrement de `HttpClient`, les modèles, services et pages, puis expliquer comment le JWT est envoyé. Comparer les routes du contrat HTTP selon qu'elles sont publiques ou protégées.

### Prompt principal
Analyser l’architecture de l’application (routes publiques des routes protégées) afin d’identifier ses principaux composants et le fonctionnement de l’authentification. Étudier ensuite le parcours d’une connexion, depuis le clic sur « Se connecter » jusqu’aux requêtes protégées, en s’appuyant sur API_CONTRACT.md

### Résultats de l'exploration

Le tableau ci-dessous associe chaque notion demandée à son emplacement et à son rôle dans l'application.

| Notion | Emplacement | Rôle |
|---|---|---|
| Composant racine | `frontend-starter/src/app/components/app/app.ts` et `app.html` | `AppComponent` porte la navigation commune et le `<router-outlet>` qui affiche la page courante. |
| Routes Angular | `frontend-starter/src/app/routes.ts` | `/login` et `/register` sont sans guard; `/profile` et `/tracks` sont protégées par `authGuard`; la racine redirige vers `/tracks`. |
| Enregistrement HTTP et routeur | `frontend-starter/src/main.ts` | `provideHttpClient(withInterceptors([authInterceptor]))` fournit `HttpClient` avec l'intercepteur; `provideRouter(routes)` fournit le routeur. |
| Pages | `frontend-starter/src/app/components/` | `LoginPageComponent`, `RegisterPageComponent`, `ProfilePageComponent` et `TracksPageComponent`, avec template et styles associés. |
| Services | `frontend-starter/src/app/shared/services/` | `AuthService` gère authentification et profil; `TrackService` gère liste, envoi et téléchargement audio des pistes. |
| Modèles | `frontend-starter/src/app/shared/models/` | `AuthResponse` décrit `{token, user}`; `User` les données publiques; `Track` les métadonnées audio; `Page<T>` la pagination. |
| Guard de navigation | `frontend-starter/src/app/shared/guards/auth.guard.ts` | Laisse passer si `AuthService.token()` existe, sinon redirige vers `/login`. Il contrôle la présence du token, pas sa validité serveur. |
| Intercepteur JWT | `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts` | Si un token existe, clone la requête et ajoute `Authorization: Bearer <token>`. Il est branché dans `main.ts`. |

### Flux annoté : clic sur « Se connecter »

```text
[login-page.html] clic « Se connecter »
    │ (ngSubmit)
    ▼
login-page.ts : submit()
    │ 1. form.getRawValue() -> { email, password }
    ▼
AuthService.login(email, password)
    │ 2. POST /api/auth/login avec { email, password }
    ▼
authInterceptor (enregistré avec HttpClient dans main.ts)
    │ 3. Lit AuthService.token()
    │    Première connexion : null -> aucun header Authorization
    │    (Si un ancien token existe, l'intercepteur l'ajoute quand même.)
    ▼
Backend : POST /api/auth/login (backend/src/app.js)
    │ Recherche l'utilisateur par email puis appelle user.verifyPassword(password)
    │ Si valide, jwt.sign({ sub, email }, SECRET, { expiresIn: "2h" })
    │ 4. Réponse 200 : { token, user }
    ▼
AuthService : tap() -> storeAuthentication(response)
    │ localStorage.setItem('gpc_token', token)
    │ token.set(token)  <- signal réactif
    │ currentUser.set(user)
    ▼
login-page.ts : next() -> router.navigateByUrl('/tracks')
    ▼
authGuard sur la route Angular 'tracks'
    │ auth.token() non-null -> navigation autorisée
    ▼
TracksPageComponent -> TrackService.list() -> GET /api/tracks
    │ authInterceptor lit maintenant le token et ajoute
    │ Authorization: Bearer <token>
    ▼
Backend : middleware auth (backend/src/app.js)
    │ jwt.verify(...) valide signature et expiration
    │ ajoute req.auth = { sub, email }
    ▼
Route protégée exécutée et réponse renvoyée au frontend
```

Le backend délègue la comparaison du mot de passe à `user.verifyPassword()`; le code de la route de connexion ne fait pas directement appel à `bcrypt.compare`. Le middleware `auth` vérifie le bearer JWT et renseigne `req.auth` avant les handlers protégés. En cas d'erreur de connexion, le bloc `error` du `subscribe` affiche le message de l'API ou « Erreur de connexion »; la navigation vers `/tracks` n'a pas lieu.

**Nuance constatée :** le commentaire de l'intercepteur parle de requêtes protégées, mais son implémentation ajoute le token à toute requête HTTP dès qu'il en existe un. Il n'exclut pas explicitement les routes publiques. Lors d'une première connexion sans token stocké, le POST de connexion part donc sans JWT; avec un token déjà présent, il en recevrait également un. Cela ne change pas le classement public/protégé défini par le contrat.

### Routes de l'API selon `API_CONTRACT.md`

Base de toutes les routes : `/api`.

| Accès | Méthode et route | Détail |
|---|---|---|
| Protégée selon la règle générale* | `GET /health` | Vérification de santé; la ligne ne précise pas l'authentification. |
| Publique | `POST /auth/register` | Inscription avec `{name, email, password}`; réponse `201 {token, user}`. |
| Publique | `POST /auth/login` | Connexion avec `{email, password}`; réponse `200 {token, user}`. |
| Protégée | `GET /users/me` | Renvoie le profil; JWT requis. |
| Protégée | `PUT /users/me` | Modifie le nom avec `{name}`; JWT requis. |
| Protégée | `GET /tracks?page=1&limit=5` | Renvoie `Page<Track>`; JWT requis. |
| Protégée | `POST /tracks` | Envoi multipart (`audio`, `title`); JWT requis. |
| Protégée | `GET /tracks/:id/audio` | Renvoie le flux audio; JWT requis. |
| Protégée (bonus) | `DELETE /tracks/:id` | Suppression; JWT requis, réponse `204`. |

Le préambule du contrat précise que, sauf inscription et connexion, il faut envoyer `Authorization: Bearer <token>`. En appliquant strictement cette règle, seules l'inscription et la connexion sont publiques; les autres routes du tableau sont protégées. **Ambiguïté à vérifier :** la ligne `GET /health` ne mentionne pas de JWT et `backend/src/app.js` décrit explicitement cet endpoint comme public. Le contrat et l'implémentation divergent donc sur ce point. Erreurs courantes documentées : `400` validation, `401` authentification, `404` ressource absente et `409` adresse e-mail déjà utilisée.

### Démarche et vérifications

- **Plan suivi :** lecture de `API_CONTRACT.md` et de la trame, puis inspection ciblée du point d'entrée Angular, du composant racine, des routes, de la page de connexion, du service d'authentification, du guard et de l'intercepteur; enfin, inventaire des pages, modèles et opérations de pistes.
- **Vérification réalisée :** lecture statique des fichiers cités et comparaison des routes d'API avec le contrat. Aucun code applicatif n'a été modifié.
- **Vérification restant au binôme :** lancer l'application et observer dans l'onglet Network le POST `/api/auth/login`, la persistance de `gpc_token`, la navigation vers `/tracks` et l'en-tête `Authorization` sur `GET /api/tracks`. Vérifier également la connexion refusée et l'accès à `/profile` sans token.
- **Propositions rejetées ou erreurs :** aucune modification du code ni proposition de correction n'a été appliquée. La nuance sur l'intercepteur est consignée comme observation, pas comme changement demandé.
- **Fichier modifié :** `RAPPORT_IA_MODELE.md` uniquement.
- **Preuve de fonctionnement :** les enchaînements et classifications ci-dessus correspondent aux appels, fournisseurs et guards lus dans le code et aux exigences de `API_CONTRACT.md`. Le test navigateur n'a pas été exécuté dans le cadre de cette mission.
- **Notions à savoir expliquer sans l'agent :** rôle du composant racine et du `router-outlet`; différence entre route Angular et route API; rôle de `provideHttpClient`, `AuthService`, `authGuard` et `authInterceptor`; parcours du formulaire jusqu'à la réponse HTTP; stockage du token et ajout de l'en-tête Bearer; classement des endpoints publics et protégés.
