# TP2 — Mission 3, partie 1 : analyse de l'upload et de la lecture audio

## 1 
### 1. La position de chaque étape

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


- l'URL finale n'est jamais révoquée quand on quitte la page (pas de `DestroyRef` / `ngOnDestroy`) ;
- les erreurs d'upload et de lecture ne vont que dans `console.error`, l'utilisateur ne voit rien.

### 2. Flux d'upload : composant → service → `HttpClient` → API

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

### 3. Flux de lecture : API → `Blob` → `ObjectURL` → lecteur audio

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

### 4. L'intercepteur et pourquoi `src` ne reçoit pas le header

**Dans le code** : [auth.interceptor.ts](frontend-starter/src/app/shared/interceptors/auth.interceptor.ts) est enregistré dans [main.ts](frontend-starter/src/main.ts) via `provideHttpClient(withInterceptors([authInterceptor]))`. Il clone chaque requête `HttpClient` en ajoutant `Authorization: Bearer <token>`. Il gère aussi un `401` en déconnectant l'utilisateur et en le renvoyant vers `/login`.

**Dans l'onglet Network** (filtre Fetch/XHR) :

- la requête `GET /api/tracks/<id>/audio` est de type `xhr` ou `fetch`, avec `Authorization: Bearer …` dans les en-têtes de requête et `Content-Type: audio/…` dans la réponse ;
- la lecture par `<audio>` n'apparaît pas comme une requête vers le serveur : elle porte sur une URL `blob:` locale.

**Pourquoi une URL placée directement dans `src` ne reçoit pas ce header :**

1. Avec `<audio src="/api/tracks/42/audio">`, c'est le **moteur média du navigateur** qui fait la requête, pas `HttpClient`. Les intercepteurs Angular ne voient que les requêtes passées par `HttpClient` : ils ne sont jamais appelés.
2. HTML ne permet pas d'ajouter des en-têtes personnalisés aux requêtes de `<audio>`, `<img>` ou `<video>`. Le navigateur y joint automatiquement les cookies, mais jamais un `Authorization` lu depuis `localStorage`.
3. Le middleware `auth` du backend ([app.js:56](backend/src/app.js#L56)) exige `Authorization: Bearer …`. Sans ce header, il répond `401 Authentification requise` et le lecteur reste vide.

Mettre le token dans l'URL (`?token=…`) contournerait le problème, mais il apparaîtrait alors dans l'historique, les logs serveur et les captures. D'où le choix `HttpClient` → `Blob` → `ObjectURL`.

### 5. Contrôles backend sur l'upload

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

### 6. Vérification du `FormData` côté frontend

[track.service.ts:17-21](frontend-starter/src/app/shared/services/track.service.ts#L17-L21) :

```ts
const body = new FormData();
body.append('audio', file);   // nom attendu par upload.single("audio")
body.append('title', title);  // lu par req.body.title
```

Les deux noms de champs correspondent exactement au backend : **conforme**. Dans Network, l'onglet *Charge utile* de `POST /api/tracks` montre un corps `multipart/form-data` avec deux parties, `audio` (binaire) et `title` (texte).

Ce qui manque côté frontend, à faire en partie 2 : aucune vérification du type ni de la taille avant l'envoi. L'attribut `accept="audio/*"` filtre seulement la fenêtre de sélection. Il laisse passer des formats refusés par le backend (FLAC, AAC…), et on peut le contourner avec « Tous les fichiers ».

---

# Partie 2 : compléments apportés au frontend

### 7. Ce qui a été ajouté

| Exigence | Réalisation | Fichier |
|---|---|---|
| Vérifier le fichier avant l'appel HTTP | `validateAudioFile()` applique les mêmes règles que le backend : types MIME du Set `allowed`, fichier non vide, 25 Mo maximum. Le contrôle a lieu dès la sélection, puis à nouveau dans `upload()` | [audio-file.ts](frontend-starter/src/app/shared/utils/audio-file.ts), [tracks-page.ts](frontend-starter/src/app/components/tracks-page/tracks-page.ts) |
| Message clair si le fichier est invalide | Exemple : « Format non accepté (audio/flac). Formats acceptés : MP3, WAV, OGG ou M4A. ». Le message s'affiche sous le champ, qui passe en rouge | [tracks-page.html](frontend-starter/src/app/components/tracks-page/tracks-page.html) |
| État de chargement | Signal `uploading` : spinner et texte « Envoi en cours… » | idem |
| Pas de double soumission | Bouton et champ fichier désactivés pendant l'envoi, et garde `if (this.uploading()) return` | idem |
| Erreurs du serveur | `TrackService.upload()` traduit l'erreur, y compris le « File too large » de Multer, qui est en anglais | [track.service.ts](frontend-starter/src/app/shared/services/track.service.ts) |
| Message de succès | « « Titre » a bien été ajouté à votre bibliothèque. », dans une zone `aria-live` | [tracks-page.html](frontend-starter/src/app/components/tracks-page/tracks-page.html) |
| Vider le formulaire, recharger la page 1 | `resetUploadForm()` vide aussi l'`<input type="file">` via `viewChild`, puis appelle `go(1)` | [tracks-page.ts](frontend-starter/src/app/components/tracks-page/tracks-page.ts) |
| Cards responsives et accessibles | Liste `<ul>`/`<li>` d'`<article>` sur une grille `auto-fill`. Chaque card affiche le titre, le nom original, le format, la taille lisible, la date (`<time>`) et un bouton de lecture avec `aria-label` | [tracks-page.html](frontend-starter/src/app/components/tracks-page/tracks-page.html), [tracks-page.css](frontend-starter/src/app/components/tracks-page/tracks-page.css) |
| Morceau en cours | Signal `currentTrack` : bandeau « En cours : … » au-dessus du lecteur, et card mise en évidence | idem |
| Erreur audio compréhensible | Échec HTTP : par exemple « Ce morceau est introuvable… ». Échec de décodage : l'événement `(error)` de `<audio>` affiche « Le navigateur ne parvient pas à lire… » | idem |
| Révoquer l'`ObjectURL` finale | `inject(DestroyRef).onDestroy(() => this.revokeAudioUrl())` | [tracks-page.ts](frontend-starter/src/app/components/tracks-page/tracks-page.ts) |

Correction au passage : la taille était affichée comme `{{ track.size }} Ko` alors que l'API la renvoie en **octets**. Elle est maintenant formatée en o, Ko ou Mo.

### 8. Pourquoi la validation frontend ne remplace pas la validation backend

La validation frontend **améliore l'expérience** : le message est immédiat et précis, et on n'attend pas l'envoi de 30 Mo pour apprendre que le fichier est refusé. On économise aussi de la bande passante et de la charge serveur.

Elle **n'apporte aucune sécurité** : le code Angular s'exécute chez l'utilisateur, qui le contrôle entièrement. Il peut le modifier dans DevTools, désactiver JavaScript ou appeler l'API directement avec `curl` ou Postman. Seul le backend est sous notre contrôle : c'est lui qui doit refuser les fichiers invalides (`fileFilter` et `limits.fileSize` de Multer).

Les deux contrôles reposent sur le type MIME **déclaré** par le navigateur, d'après l'extension. Ni l'un ni l'autre ne prouve que le contenu est réellement de l'audio.

### 9. Blob complet, buffering du navigateur et streaming serveur

| | Où | Ce qui se passe | Dans ce projet |
|---|---|---|---|
| **Streaming côté serveur** | Express | Le serveur lit le fichier sur le disque par morceaux (*chunks*) et les écrit au fur et à mesure dans la réponse HTTP, sans charger tout le fichier en RAM | Oui : `res.sendFile()` utilise un flux de lecture. Il gère aussi les requêtes `Range` (réponse `206 Partial Content`) |
| **Téléchargement complet d'un `Blob`** | Angular / `HttpClient` | Avec `responseType: 'blob'`, `HttpClient` accumule tous les octets reçus et n'émet le `Blob` qu'**à la fin** du téléchargement. La lecture ne peut donc commencer qu'après le téléchargement complet, et tout le fichier occupe la mémoire du navigateur | Oui : c'est notre mécanisme de lecture authentifiée |
| **Buffering du navigateur** | Élément `<audio>` | Avec une URL HTTP dans `src`, le lecteur télécharge un peu d'avance (le *buffer*), démarre la lecture dès qu'il en a assez, puis continue à charger pendant la lecture. Il peut sauter à un instant précis avec des requêtes `Range` | Non : le lecteur reçoit une URL `blob:` locale, déjà entièrement en mémoire, donc il n'y a rien à « bufferiser » sur le réseau |

En résumé : le serveur **streame** bien le fichier, mais `HttpClient` **reconstitue un Blob complet** avant de le donner au lecteur. On perd le démarrage progressif que permettrait le buffering natif de `<audio>`. C'est le prix à payer pour envoyer le header `Authorization`, qu'une URL placée dans `src` ne peut pas porter (voir section 4).

Pour retrouver une lecture progressive tout en restant authentifié, il faudrait une autre solution d'authentification de la requête média : un cookie `HttpOnly`, ou une URL signée à durée de vie courte générée par le backend. Ces deux solutions modifieraient le contrat HTTP, ce que la mission interdit.
