# Rapport — Cards de la bibliothèque audio (TP2, mission 3)

Les morceaux s'affichent maintenant sous forme de cards responsives et accessibles. Chaque card montre le titre, le nom original, le format, la taille, la date d'ajout et un bouton de lecture. Le backend, le contrat HTTP, la pagination et la lecture audio n'ont pas été modifiés.

| Fichier modifié | Modifications faites |
|---|---|
| `frontend-starter/src/app/shared/pipes/track-format.pipes.ts` (nouveau) | Trois pipes de formatage, purs et réutilisables. `audioFormat` transforme le type MIME en libellé lisible (`audio/mpeg` → `MP3`, `audio/x-m4a` → `M4A`…). `fileSize` convertit la taille, que l'API renvoie en **octets**, en o / Ko / Mo (ex. `3,4 Mo`). `shortDate` formate la date ISO en français (ex. `7 oct. 2026`). |
| `frontend-starter/src/app/components/tracks-page/tracks-page.ts` | Import des trois pipes dans `imports` du composant. Aucune logique modifiée. |
| `frontend-starter/src/app/components/tracks-page/tracks-page.html` | La liste de lignes `<div class="track">` est remplacée par une liste `<ul>` / `<li>` de cards `<article>`. Chaque card contient : une vignette décorative (`aria-hidden`) ; le titre en `<h3>`, relié à la card par `aria-labelledby` ; le nom original ; une liste de définitions `<dl>` (Format, Taille, Ajouté le), avec la date dans une balise `<time datetime>` ; le bouton de lecture avec `aria-label="Lire <titre>"`. Un titre trop long est coupé avec « … », et le texte complet reste visible au survol (`title`). L'état vide devient un message « Aucune piste pour l'instant… ». Correction : la taille était affichée en « Ko » alors que la valeur est en octets. |
| `frontend-starter/src/app/components/tracks-page/tracks-page.css` | Styles des cards. **Responsive** : grille `repeat(auto-fill, minmax(260px, 1fr))`, qui passe de 1 à plusieurs colonnes selon la largeur, sans media query. **Mise en forme** : vignette dégradée, badge de format, métadonnées en ligne qui passent à la ligne si besoin. **Accessibilité** : la bordure et l'ombre de la card réagissent aussi à `:focus-within`, ce qui rend visible la card dont le bouton a le focus clavier. L'état vide a une bordure en pointillés. |

## Accessibilité

- **Structure** : liste sémantique (`<ul>`, `<li>`), un `<article>` par morceau et un titre `<h3>` sous le `<h2>` « Mes pistes ». Le lecteur d'écran annonce « liste, N éléments ».
- **Métadonnées** : `<dl>`, `<dt>` et `<dd>` associent chaque libellé à sa valeur.
- **Bouton de lecture** : il ne contient qu'une icône, mais son `aria-label` indique le morceau (« Lire Blues en La »).
- **Icônes** : elles sont décoratives et masquées aux technologies d'assistance.
- **Clavier** : navigation avec Tab sur les boutons, avec un focus visible.

## Vérification

- `ng build` : succès.
- Test existant `tracks-page.spec.ts` : 1/1 réussi (`ng test --watch=false --build-target=gpc:build`).
- À vérifier dans le navigateur : affichage sur grand écran et sur mobile (mode appareil des DevTools, **Ctrl + Maj + M**), navigation au clavier avec Tab, et liste vide.
