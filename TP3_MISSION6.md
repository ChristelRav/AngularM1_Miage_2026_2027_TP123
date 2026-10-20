# TP3 — Mission 6 : upload avec progression

## Question

Pourquoi un upload avec progression ne se traite-t-il pas exactement comme une requête HTTP qui émet uniquement une réponse finale ?

## Réponse courte

Une requête HTTP classique produit **une seule valeur** : le corps de la réponse. Ensuite, l'`Observable` se termine. Un upload avec progression produit **un flux d'événements** : un début d'envoi, plusieurs étapes d'avancement, puis la réponse. Le code doit donc distinguer le type de chaque événement, mettre à jour un état intermédiaire et attendre l'événement final pour considérer l'opération comme réussie.

## 1. Une valeur unique contre un flux d'événements

**Requête classique**, par exemple la liste des pistes :

```ts
this.http.get<Page<Track>>('/api/tracks')   // Observable<Page<Track>>
```

`next` est appelé **une seule fois**, avec les données déjà prêtes à l'emploi.

**Upload avec progression** :

```ts
this.http.post<Track>('/api/tracks', body, {
  reportUploadProgress: true,
  observe: 'events',
})                                           // Observable<HttpEvent<Track>>
```

`next` est appelé **plusieurs fois**, avec des objets de types différents :

| Ordre | `event.type` | Contenu utile |
|---|---|---|
| 1 | `HttpEventType.Sent` | La requête est partie (aucune donnée) |
| 2…n | `HttpEventType.UploadProgress` | `loaded` (octets envoyés) et `total` (taille totale, parfois absente) |
| n+1 | `HttpEventType.ResponseHeader` | Statut et en-têtes, sans le corps |
| dernier | `HttpEventType.Response` | `body` : le `Track` créé par le serveur |

Le `Track` n'est disponible que dans le **dernier** événement. Écrire `next: (track) => …` comme pour une requête classique ne fonctionne donc plus. Il faut tester le type de l'événement :

```ts
next: (event) => {
  if (event.type === HttpEventType.UploadProgress) {
    const progress = event.total ? Math.round((100 * event.loaded) / event.total) : null;
    this.uploadState.set({ status: 'uploading', progress });
  } else if (event.type === HttpEventType.Response && event.body) {
    // Seul cet événement signifie que l'upload a réussi.
  }
}
```

## 2. Il faut le demander explicitement

Par défaut, `HttpClient` ne renvoie que le corps de la réponse. Pour recevoir la progression, il faut deux options :

- `observe: 'events'` : recevoir tous les événements, pas seulement le corps ;
- `reportUploadProgress: true` : demander les événements `UploadProgress`. Depuis Angular 22, cette option remplace `reportProgress`, désormais déprécié.

Le type de retour change aussi : on passe de `Observable<Track>` à `Observable<HttpEvent<Track>>`. Tout le code appelant doit s'adapter.

Enfin, le moyen d'envoi compte. Depuis Angular 21, `HttpClient` utilise l'API `fetch` par défaut, et `fetch` ne sait pas mesurer l'avancement d'un envoi. Dans ce projet, il a fallu ajouter `withXhr()` dans `provideHttpClient()` (fichier `main.ts`). Sans cela, aucun événement `UploadProgress` n'était émis et la barre restait à 0 %, sans erreur visible.

## 3. Il faut gérer des états intermédiaires

Une requête classique n'a en pratique que trois états : chargement, succès, erreur. Un upload avec progression en a davantage, que l'interface doit tous afficher. Le composant les modélise donc avec un type `UploadState` :

```ts
type UploadState =
  | { status: 'idle' }                                // aucun envoi
  | { status: 'uploading'; progress: number | null }  // envoi en cours
  | { status: 'success'; message: string }            // réussite
  | { status: 'error'; message: string };             // échec
```

Plusieurs pièges n'existent pas avec une réponse unique :

- **100 % ne veut pas dire succès.** `loaded === total` indique seulement que le navigateur a fini d'**envoyer** les octets. Le serveur doit encore valider le fichier, l'écrire sur le disque (`data/uploads`) et créer la métadonnée dans MongoDB. Il peut encore refuser l'upload (format invalide, fichier trop gros, base indisponible). C'est pourquoi l'interface affiche « Fichier envoyé, traitement par le serveur… » à 100 %, et ne montre la réussite qu'à la réception de `HttpEventType.Response`.
- **`total` peut être absent.** Si la taille totale est inconnue, on ne peut pas calculer de pourcentage. La barre devient alors indéterminée (`progress: null`).
- **Un échec peut survenir après une progression partielle.** Par exemple, la connexion se coupe à 60 %. Le gestionnaire `error` doit alors remplacer l'état « en cours » par l'état d'échec, sans laisser une barre bloquée à 60 %.

## 4. Les effets de bord ne doivent s'exécuter qu'une fois

Avec une réponse unique, on peut tout faire dans `next` : vider le formulaire, recharger la liste, afficher un message. Avec un flux, `next` est appelé des dizaines de fois. Si on y place ces actions sans filtrer le type d'événement, la liste serait rechargée à chaque étape de progression. Le formulaire serait aussi vidé dès le premier événement, alors que l'envoi n'est pas terminé.

Dans ce projet, `resetUploadForm()` et `go(1)` ne sont appelés que dans la branche `HttpEventType.Response`.

## 5. Les opérateurs RxJS se comportent différemment

Les opérateurs placés dans le `pipe` s'appliquent à **chaque événement**, pas seulement au résultat final :

- un `map((track) => track.title)` écrit pour une requête classique planterait, car les événements de progression n'ont pas de `title` ;
- pour ne garder que le résultat, il faut filtrer, par exemple avec `filter((e) => e.type === HttpEventType.Response)`, mais on perd alors la progression ;
- `catchError` reste valable : une erreur HTTP arrête le flux comme pour une requête classique. C'est pour cela que la traduction des erreurs dans `TrackService.upload()` n'a pas changé.

## 6. Le rafraîchissement de l'affichage

Chaque événement `UploadProgress` modifie l'état, et Angular met à jour l'affichage à chaque fois. Avec un signal (`uploadState`), seule la zone qui en dépend est recalculée. La zone d'état utilise aussi `aria-live="polite"`, pour que les lecteurs d'écran annoncent la progression sans interrompre l'utilisateur.

## En résumé

| | Requête à réponse unique | Upload avec progression |
|---|---|---|
| Valeurs émises | 1 (le corps) | Plusieurs `HttpEvent` |
| Options | Aucune | `observe: 'events'` et `reportUploadProgress: true` (et `withXhr()` depuis Angular 21) |
| Type retourné | `Observable<Track>` | `Observable<HttpEvent<Track>>` |
| Traitement dans `next` | Direct | Selon `event.type` |
| États de l'interface | Chargement, succès, erreur | Aucun envoi, en cours (avec %), traitement serveur, succès, erreur |
| Moment du succès | Premier (et seul) `next` | Seulement à `HttpEventType.Response`, jamais à 100 % |
| Effets de bord | Dans `next` | Uniquement dans la branche `Response` |
