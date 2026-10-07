# TP2 — Mission 3, partie 1 : analyse de l'upload et de la lecture audio

Cette partie est une analyse : aucun code n'a été modifié. Le mécanisme d'upload et de lecture sécurisée existe déjà côté frontend et backend, et le `FormData` envoie bien exactement `audio` et `title`.

## 1. Où se trouve chaque étape

| Étape | Fichier | Méthode / ligne |
|---|---|---|
| Choix du fichier | [tracks-page.html](frontend-starter/src/app/components/tracks-page/tracks-page.html#L15) → [tracks-page.ts](frontend-starter/src/app/components/tracks-page/tracks-page.ts#L27) | `<input type="file" (change)="choose($event)">` → `choose()` stocke `files[0]` dans `this.file` |
| Déclenchement de l'envoi | [tracks-page.ts](frontend-starter/src/app/components/tracks-page/tracks-page.ts#L53) | `upload()` appelle `service.upload(file, title || file.name)` |
| Construction du `FormData` | [track.service.ts](frontend-starter/src/app/shared/services/track.service.ts#L17-L20) | `TrackService.upload()` : `append('audio', file)` puis `append('title', title)` |
| Appel HTTP d'upload | [track.service.ts](frontend-starter/src/app/shared/services/track.service.ts#L21) | `http.post<Track>('/api/tracks', body)` |
| Récupération du `Blob` | [track.service.ts](frontend-starter/src/app/shared/services/track.service.ts#L24-L27) | `TrackService.audio(id)` : `http.get(..., { responseType: 'blob' })` |
| Création de l'`ObjectURL` | [tracks-page.ts](frontend-starter/src/app/components/tracks-page/tracks-page.ts#L74) | `play()` : `URL.createObjectURL(blob)` |
| Affectation au lecteur `<audio>` | [tracks-page.ts](frontend-starter/src/app/components/tracks-page/tracks-page.ts#L74) + [tracks-page.html](frontend-starter/src/app/components/tracks-page/tracks-page.html#L46-L47) | Signal `audioUrl.set(...)`, puis `<audio [src]="audioUrl()" controls autoplay>` |
| Révocation de l'ancienne URL | [tracks-page.ts](frontend-starter/src/app/components/tracks-page/tracks-page.ts#L72-L73) | `play()` : `URL.revokeObjectURL(previousUrl)` avant d'en créer une nouvelle |
| Ajout du JWT | [auth.interceptor.ts](frontend-starter/src/app/shared/interceptors/auth.interceptor.ts) | `authInterceptor` : `request.clone({ setHeaders: { Authorization: 'Bearer …' } })` |

Deux manques sont visibles dès cette analyse ; ils seront traités dans la partie 2 :

- l'URL finale n'est jamais révoquée quand on quitte la page (pas de `DestroyRef` / `ngOnDestroy`) ;
- les erreurs d'upload et de lecture ne vont que dans `console.error`, l'utilisateur ne voit rien.

## 2. Flux d'upload : composant → service → `HttpClient` → API

```text
<input type="file">  ──(change)──►  TracksPageComponent.choose()      this.file = File
<button Envoyer>     ──(click)───►  TracksPageComponent.upload()
                                        │  title || file.name
                                        ▼
                                    TrackService.upload(file, title)
                                        │  FormData { audio: File, title: string }
                                        ▼
                                    HttpClient.post('/api/tracks', formData)
                                        │  authInterceptor ajoute Authorization: Bearer <jwt>
                                        ▼
                                    proxy Angular (:4200) ──► Express (:3000)
                                        │  auth → upload.single("audio") → handler
                                        ▼
                                    201 Track (JSON)  ──►  composant : vide le titre, page 1, load()
```

Le service ne fixe pas `Content-Type` à la main. C'est correct : avec un `FormData`, le navigateur écrit lui-même `multipart/form-data; boundary=…`. Un `Content-Type` forcé sans `boundary` rendrait le corps illisible pour Multer.

## 3. Flux de lecture : API → `Blob` → `ObjectURL` → lecteur audio

```text
bouton ▶  ──►  TracksPageComponent.play(track)
                  ▼
              TrackService.audio(id)  ──►  HttpClient.get('/api/tracks/:id/audio', { responseType: 'blob' })
                  │  authInterceptor ajoute Authorization: Bearer <jwt>
                  ▼
              Express : auth → Track.findOne({ _id, ownerId }) → res.sendFile(fichier)
                  │  Content-Type: audio/mpeg (ou wav, ogg, mp4)
                  ▼
              Blob complet en mémoire du navigateur
                  ▼
              URL.createObjectURL(blob)  →  "blob:http://localhost:4200/3f2c…"
                  ▼
              audioUrl.set(url)  →  <audio [src]="audioUrl()">  lit depuis la mémoire, sans réseau
```

`HttpClient` n'émet le `Blob` qu'une fois le fichier entièrement téléchargé. L'`ObjectURL` est une adresse locale qui pointe vers ce `Blob` en mémoire : quand `<audio>` la lit, aucune nouvelle requête HTTP ne part vers le serveur.

## 4. L'intercepteur et pourquoi `src` ne reçoit pas le header

**Dans le code** : [auth.interceptor.ts](frontend-starter/src/app/shared/interceptors/auth.interceptor.ts) est enregistré dans [main.ts](frontend-starter/src/main.ts) via `provideHttpClient(withInterceptors([authInterceptor]))`. Il clone chaque requête `HttpClient` en ajoutant `Authorization: Bearer <token>`. Il gère aussi un `401` en déconnectant l'utilisateur et en le renvoyant vers `/login`.

**Dans l'onglet Network** (filtre Fetch/XHR) :

- la requête `GET /api/tracks/<id>/audio` est de type `xhr` ou `fetch`, avec `Authorization: Bearer …` dans les en-têtes de requête et `Content-Type: audio/…` dans la réponse ;
- la lecture par `<audio>` n'apparaît pas comme une requête vers le serveur : elle porte sur une URL `blob:` locale.

**Pourquoi une URL placée directement dans `src` ne reçoit pas ce header :**

1. Avec `<audio src="/api/tracks/42/audio">`, c'est le **moteur média du navigateur** qui fait la requête, pas `HttpClient`. Les intercepteurs Angular ne voient que les requêtes passées par `HttpClient` : ils ne sont jamais appelés.
2. HTML ne permet pas d'ajouter des en-têtes personnalisés aux requêtes de `<audio>`, `<img>` ou `<video>`. Le navigateur y joint automatiquement les cookies, mais jamais un `Authorization` lu depuis `localStorage`.
3. Le middleware `auth` du backend ([app.js:56](backend/src/app.js#L56)) exige `Authorization: Bearer …`. Sans ce header, il répond `401 Authentification requise` et le lecteur reste vide.

Mettre le token dans l'URL (`?token=…`) contournerait le problème, mais il apparaîtrait alors dans l'historique, les logs serveur et les captures. D'où le choix `HttpClient` → `Blob` → `ObjectURL`.

## 5. Contrôles backend sur l'upload

| Contrôle | Où dans [app.js](backend/src/app.js) | Réponse en cas d'échec |
|---|---|---|
| JWT obligatoire | middleware `auth`, [L56](backend/src/app.js#L56), placé avant Multer sur la route [L335-L337](backend/src/app.js#L335-L337) | `401` |
| Le multipart contient le fichier `audio` | `upload.single("audio")` [L337](backend/src/app.js#L337) ; puis `if (!req.file)` [L340](backend/src/app.js#L340) | `400 Fichier audio requis` |
| Lecture du champ `title` | `title: req.body.title \|\| req.file.originalname` [L347](backend/src/app.js#L347) | Pas d'erreur : nom du fichier par défaut |
| Formats acceptés (MP3, WAV, OGG, M4A) | Set `allowed` [L34-L41](backend/src/app.js#L34-L41) : `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/ogg`, `audio/mp4`, `audio/x-m4a` ; vérifié par `fileFilter` [L109](backend/src/app.js#L109) | `400 Format audio non accepté` |
| 25 Mo maximum | `MAX_FILE_SIZE = 25 * 1024 * 1024` [L31](backend/src/app.js#L31) ; `limits: { fileSize }` [L108](backend/src/app.js#L108) | `400 File too large` (MulterError) |
| Conversion des erreurs Multer en `400` | gestionnaire central [L442-L449](backend/src/app.js#L442-L449) | `400` avec `message` |
| Lecture réservée au propriétaire | `Track.findOne({ _id, ownerId: req.auth.sub })` [L379-L384](backend/src/app.js#L379-L384) | `404 Piste inconnue` (même réponse si la piste existe chez un autre utilisateur) |

Le contrôle du type porte sur `file.mimetype`, c'est-à-dire le type **déclaré par le client**. Le backend ne lit pas le contenu du fichier pour vérifier qu'il s'agit réellement d'un fichier audio.

## 6. Vérification du `FormData` côté frontend

[track.service.ts:17-21](frontend-starter/src/app/shared/services/track.service.ts#L17-L21) :

```ts
const body = new FormData();
body.append('audio', file);   // nom attendu par upload.single("audio")
body.append('title', title);  // lu par req.body.title
```

Les deux noms de champs correspondent exactement au backend : **conforme**. Dans Network, l'onglet *Charge utile* de `POST /api/tracks` montre un corps `multipart/form-data` avec deux parties, `audio` (binaire) et `title` (texte).

Ce qui manque côté frontend, à faire en partie 2 : aucune vérification du type ni de la taille avant l'envoi. L'attribut `accept="audio/*"` filtre seulement la fenêtre de sélection. Il laisse passer des formats refusés par le backend (FLAC, AAC…), et on peut le contourner avec « Tous les fichiers ».
