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

## Mission : déconnexion, chargement du profil et gestion du 401

### Prompt principal

« Ajouter un bouton de déconnexion dans la navbar qui nettoie l'état local; charger `/api/users/me` à l'ouverture du profil; modifier le nom avec `PUT /api/users/me`; gérer un `401` en supprimant la session et en renvoyant vers `/login` si le token est invalide ou expiré. Préciser la durée de vie du token et mettre à jour le rapport avec le prompt, les critiques et les vérifications à venir. »

### Changements réalisés

| Fichier | Résultat |
|---|---|
| `frontend-starter/src/app/components/app/app.ts` et `app.html` | La navbar affiche « Déconnexion » quand une session existe. Le clic appelle `AuthService.logout()` puis navigue vers `/login`; sinon, le lien « Connexion » reste visible. |
| `frontend-starter/src/app/components/profile-page/profile-page.ts` et `profile-page.html` | L'ouverture de la page déclenche `AuthService.profile()` (`GET /api/users/me`). Le formulaire conserve l'enregistrement du nom via `AuthService.update()` (`PUT /api/users/me`). |
| `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts` | Un `401` reçu sur une requête protégée efface l'état local et redirige vers `/login`. Les `401` de `/auth/login` ne sont pas traités comme une expiration de session, afin de laisser le formulaire afficher les identifiants incorrects. |

Le service `AuthService` existant retire déjà `gpc_token` du `localStorage` et remet ses signaux `token` et `currentUser` à `null` lors de `logout()`. Le backend crée le JWT avec `expiresIn: "2h"` : sa durée de vie est **2 heures**.

### Critiques et vérifications à venir

- Le guard Angular vérifie seulement la présence du token. C'est le backend qui détecte une signature invalide ou une expiration; le frontend réagit au `401` de la requête protégée suivante. Il n'y a pas de renouvellement automatique du token.
- Vérifier dans le navigateur : connexion, ouverture du profil et `GET /api/users/me`; modification du nom et `PUT /api/users/me`; déconnexion et absence de `gpc_token` dans le stockage local.
- Pour tester l'expiration sans attendre deux heures, envoyer une valeur JWT invalide ou expirée, provoquer une requête protégée, puis confirmer le `401`, le nettoyage de session et le retour à `/login`. Vérifier aussi qu'un mauvais mot de passe conserve le message de connexion au lieu d'être traité comme une session expirée.
- Après modification, le build Angular reste à exécuter; ces vérifications navigateur ne sont pas déclarées comme réalisées tant qu'elles n'ont pas été faites.

## Mission : routes backend, séparation des responsabilités et réflexion IA

### Prompt principal

« Vérifier que les composants n'appellent pas directement `HttpClient`, qu'ils passent par les services injectés avec `inject()`, et expliquer la séparation interface/service/API. Lister les routes backend effectivement utilisées par le frontend. Décrire précisément où s'effectue la mise à jour du profil utilisateur côté frontend et backend. Compléter le rapport avec les prompts, les points critiques à vérifier et une réflexion sur Copilot, Claude et la consommation de tokens. »

### Séparation interface, service et API

La recherche dans `frontend-starter/src/app/` confirme que `HttpClient` est injecté uniquement dans `AuthService` et `TrackService`, pas directement dans les composants. Les composants utilisent `inject(AuthService)` ou `inject(TrackService)`, puis appellent des méthodes du service. Le service construit la requête HTTP et l'API backend la traite.

`inject(Type)` demande à Angular de fournir une dépendance depuis son système d'injection dans un contexte Angular valide, par exemple l'initialisation d'un champ ou d'un constructeur. Cela évite de créer soi-même un service avec `new`, conserve les services partagés déclarés avec `providedIn: 'root'` et facilite le remplacement par des doublures dans les tests. Ici, les composants injectent des services métier; seuls ces services injectent `HttpClient` pour accéder à l'API.

### Routes backend utilisées par le frontend

Toutes les URL ci-dessous sont préfixées par `/api`. Les appels sont centralisés dans `AuthService` et `TrackService`.

| Méthode et route | Appel frontend | Accès et usage |
|---|---|---|
| `POST /auth/register` | `AuthService.register()` | Publique; crée un compte et renvoie le token et l'utilisateur. |
| `POST /auth/login` | `AuthService.login()` | Publique; authentifie l'utilisateur et renvoie le token et l'utilisateur. |
| `GET /users/me` | `AuthService.profile()` | Protégée; charge le profil de l'utilisateur connecté. |
| `PUT /users/me` | `AuthService.update(name)` | Protégée; modifie le nom de l'utilisateur connecté. |
| `GET /tracks?page=...&limit=...` | `TrackService.list()` | Protégée; charge une page de pistes. |
| `POST /tracks` | `TrackService.upload()` | Protégée; envoie le fichier audio et son titre en multipart. |
| `GET /tracks/:id/audio` | `TrackService.audio(id)` | Protégée; récupère l'audio d'une piste. |

Le backend expose aussi `GET /health` et `DELETE /tracks/:id` (bonus). Dans l'état du frontend inspecté, aucun service n'appelle ces deux routes; elles ne sont donc pas comptées parmi les routes consommées par l'interface Angular.

### Où s'effectue la mise à jour du profil ?

La tâche traverse les fichiers suivants, chacun avec une responsabilité distincte :

1. **Interface Angular :** `frontend-starter/src/app/components/profile-page/profile-page.html` contient le formulaire et lie sa soumission à `save()`.
2. **Composant :** `frontend-starter/src/app/components/profile-page/profile-page.ts` injecte `AuthService` avec `inject(AuthService)`. `save()` lit le nom du formulaire et appelle `this.auth.update(...)`; il ne construit aucune requête HTTP.
3. **Service frontend :** `frontend-starter/src/app/shared/services/auth.service.ts`, méthode `update(name)`, envoie `PUT /api/users/me` avec `{ name }`. À la réponse, `tap()` met à jour le signal `currentUser`.
4. **JWT frontend :** `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts` ajoute `Authorization: Bearer <token>` à la requête si un token est présent.
5. **Route backend :** `backend/src/app.js`, handler `app.put('/api/users/me', auth, ...)`. Le middleware `auth` vérifie le JWT et place son contenu dans `req.auth`; le handler retrouve l'utilisateur avec `req.auth.sub`, applique le nouveau nom avec `User.findByIdAndUpdate(..., { new: true, runValidators: true })`, puis renvoie `user.toPublic()`. Si l'utilisateur n'existe pas, la route répond `404`.

**Réponse courte à savoir donner :** l'interface déclenche l'action dans `profile-page.html`, le composant `profile-page.ts` délègue à `AuthService`, `auth.service.ts` envoie le `PUT`, et `backend/src/app.js` valide le JWT puis persiste le nom. Le modèle backend `backend/src/models/User.js` porte le schéma et ses règles de validation Mongoose.

### Questions de réflexion sur l'IA

- **Quel assistant est utilisé ?** Dans cette session, l'assistant est GitHub Copilot. Le binôme utilise également Claude IA. Le nom exact du modèle sous-jacent à Copilot dépend du modèle sélectionné dans l'interface Copilot; il faut consulter le sélecteur de modèle dans VS Code plutôt que le déduire du code du projet.

- **Comment connaître la consommation de tokens ?** L'assistant n'a pas accès à la facturation ni au compteur du compte de l'utilisateur. Consulter les indicateurs d'utilisation/facturation fournis par le compte GitHub Copilot et par l'interface ou le compte Anthropic pour Claude. Selon l'offre, l'interface peut compter des requêtes ou afficher une consommation agrégée plutôt qu'un total exact de tokens par conversation; ne pas présenter une estimation comme une mesure réelle.
- **Qui peut conseiller le meilleur modèle ?** Le sélecteur Copilot et ses descriptions aident à choisir; la documentation des fournisseurs, l'enseignant et le binôme peuvent compléter ce conseil. Le meilleur choix dépend de la tâche, des contraintes de coût et de latence : comparer les résultats sur un exemple représentatif reste la vérification la plus concrète.

### Critiques et vérifications à venir

- Confirmer avec un test que modifier le nom déclenche bien `PUT /api/users/me`, que l'en-tête Bearer est présent et que la réponse actualise le nom affiché.
- Vérifier dans Network que les composants ne produisent pas eux-mêmes de requêtes et que les appels API passent par `AuthService` ou `TrackService`.
- Confirmer la liste des routes consommées dans l'onglet Network, notamment distinguer les endpoints exposés par le backend des endpoints réellement appelés par le frontend.
- Aucun chiffre de tokens n'est rapporté ici, car aucun compteur de compte ou relevé de facturation n'a été consulté.

## Mission 2 : bibliothèque paginée côté serveur

### Prompt utilisé

« Implémenter la pagination de la bibliothèque Angular en envoyant `page` et `limit` à `GET /api/tracks`, utiliser les Signals et la syntaxe `@if`/`@for`/`@empty`, permettre la navigation entre les pages, ne pas modifier le backend et documenter les changements en prenant ce rapport comme exemple. »

### Constats avant modification

- `TracksPageComponent` utilisait déjà les Signals `tracks`, `page`, `pages` et `loading`, avec `@if`, `@for` et `@empty` dans le template. Il n'avait pas de signal d'erreur.
- `TrackService.list(page = 1, limit = 5)` envoyait déjà `page` et `limit` dans les paramètres de `GET /api/tracks`. Le composant n'indiquait pas explicitement `limit`, et sa navigation HTML gérait les bornes avec des boutons « Préc. » et « Suiv. ».
- `API_CONTRACT.md` confirme une réponse `Page<Track>` contenant `items`, `page`, `limit`, `total` et `pages`.
- Angular Material était déjà présent dans les dépendances et son thème figurait dans la configuration du frontend; aucun package n'a été ajouté pour cette mission.

### Modifications effectuées

| Fichier | Modification |
|---|---|
| `frontend-starter/src/app/components/tracks-page/tracks-page.ts` | Ajout d'une limite explicite de 5 pistes par page, d'un signal `error` et d'un signal `total` pour le paginator. Le chargement appelle `TrackService.list(page, limit)`, met à jour les métadonnées de réponse et affiche les erreurs avec le helper partagé `httpErrorMessage`. L'événement de pagination déclenche `go()` et donc une nouvelle requête. |
| `frontend-starter/src/app/components/tracks-page/tracks-page.html` | Remplacement des boutons natifs par `MatPaginator`; les boutons de pagination sont libellés « Précédent » et « Suivant ». L'affichage des résultats reste en `@for` avec `@empty`; les états de chargement et d'erreur utilisent `@if`. |
| `frontend-starter/src/app/components/tracks-page/tracks-page.spec.ts` | Ajout d'un test HTTP ciblé qui vérifie les paramètres `page=1&limit=5` au chargement initial puis `page=2&limit=5` après le changement de page, ainsi que les pistes reçues. |
| `RAPPORT_IA.md` | Ajout du présent compte rendu. |

`TrackService` et le backend n'ont pas été modifiés : le service envoyait déjà les deux paramètres via `HttpClient` et l'API répond déjà au contrat paginé. Aucune pagination locale n'est effectuée.

### Choix techniques, vérification et limites

- `MatPaginator` est utilisé parce qu'Angular Material était déjà installé et configuré; sa taille de page est fixe à 5 et aucune dépendance n'a été ajoutée.
- Le `MatPaginatorIntl` localise les libellés des boutons en français. Le signal `total` fournit le nombre d'éléments au paginator, tandis que `pages` conserve le nombre total de pages renvoyé par l'API.
- La vérification de diagnostics disponible dans VS Code n'a signalé aucune erreur dans le composant, son template et le test.
- L'exécution du test et de `npm run build` a été refusée par l'outil d'exécution pendant cette session. Le test a donc été écrit mais son résultat, le build et une observation réelle de la requête dans l'onglet Network restent à confirmer. Le test ajouté doit démontrer qu'un changement de page entraîne une seconde requête avec les bons paramètres lorsqu'il sera exécuté.

### Critiques et évolutions possibles

- Le test HTTP n'a pas pu être exécuté ici; il faut lancer le test ciblé et le build, puis confirmer les requêtes dans Network avec le backend actif.
- L'option avancée de pagination Mongoose avec `aggregate-paginate-v2` n'a pas été réalisée. Si elle est retenue plus tard, il faudra adapter la réponse backend, mettre à jour `API_CONTRACT.md` et ajuster le modèle et le traitement frontend.
- Des tests supplémentaires pourraient couvrir les erreurs HTTP, une page sans résultat et le désactivation des commandes aux première et dernière pages.

## Mission 2 — Amélioration de la pagination avec Angular Material

### Prompt utilisé

« Remplacer le système actuel de pagination par le composant officiel `MatPaginator`, avec choix du nombre d'éléments, plage affichée et boutons première/précédente/suivante/dernière page. Conserver la pagination côté serveur et déclencher une nouvelle requête avec les nouvelles valeurs `page` et `limit` lors d'un changement de page ou de taille. Conserver les Signals existants, ne pas modifier le backend ni le contrat API, et ajouter le prompt et les modifications réellement effectuées à ce rapport. »

### Modifications effectuées

| Fichier | Modification |
|---|---|
| `frontend-starter/src/app/components/tracks-page/tracks-page.ts` | `limit` est maintenant un Signal; les options de taille sont 5, 10, 25 et 50 éléments. `pageChanged()` prend `pageIndex` et `pageSize` de l'événement Angular Material, met à jour l'état puis relance le chargement serveur. Les libellés des commandes et du sélecteur sont localisés en français. |
| `frontend-starter/src/app/components/tracks-page/tracks-page.html` | Activation des options de taille et de `showFirstLastButtons` sur `MatPaginator`; le nombre total (`total`) et la page courante continuent de provenir de la réponse paginée serveur. |
| `frontend-starter/src/app/components/tracks-page/tracks-page.spec.ts` | Extension du test HTTP pour vérifier qu'un changement de page envoie `page=2&limit=5`, puis qu'un changement de taille envoie `page=1&limit=10`. |
| `RAPPORT_IA.md` | Ajout de ce compte rendu de suivi. |

### Choix et vérifications

- Le `MatPaginator` officiel reste relié à `TrackService.list(page, limit)`; aucune récupération intégrale ni découpe locale des pistes n'est ajoutée.
- Les tailles proposées sont 5, 10, 25 et 50. Angular Material affiche la plage d'éléments calculée avec la longueur totale renvoyée par le serveur et désactive ses commandes aux limites.
- Le signal `pages` et les signaux `tracks`, `page`, `loading` et `error` sont conservés.
- Le test automatisé vérifie les paramètres des deux requêtes attendues. Son exécution et le build restent à lancer; aucun résultat d'exécution n'est affirmé dans ce rapport.

### Évolutions futures

- Exécuter le test ciblé et le build, puis confirmer dans Network les paramètres réels des requêtes avec le backend actif.
- Les options de taille pourraient être ajustées aux volumes usuels de la bibliothèque; aucune modification backend ou de `API_CONTRACT.md` n'est nécessaire pour cette intégration.
