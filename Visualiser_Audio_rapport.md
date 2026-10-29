# Fond animé MilkDrop (Butterchurn) aux couleurs du projet

## Prompt
OK, implémente-le dans le projet, mais le code couleur du MilkDrop doit respecter celui du projet (tu peux ajouter un peu si c'est nécessaire), et mets dans rapport.md les changements des fichiers dans un tableau et les paquets installés.

## Résumé

Pendant la lecture d'un morceau, un **visualiseur MilkDrop** (bibliothèque Butterchurn, en WebGL) anime le fond de toute la page au rythme de la musique. Il réagit à l'`AudioNode` du lecteur déjà en place, sans second téléchargement du son.

- **Couleurs du projet** : les couleurs d'origine des presets MilkDrop sont remplacées par la palette de l'application grâce à une **gradient map**, comme dans Photoshop. On calcule la luminosité de chaque pixel, puis on lui attribue la couleur correspondante d'un dégradé construit avec les couleurs du projet :
  - **thème sombre** : du bleu nuit (`#05080f`) au bleu marine (`--blue-800`), puis au bleu (`--blue-600`), au bleu clair (`--primary-fg` du thème sombre) et au doré (`--accent`) ;
  - **thème clair** : le fond de page, le bleu pâle, le bleu clair, le bleu vif, puis le doré et le doré foncé, pour que le dessin reste discret sur fond clair ;
  - **une seule couleur ajoutée** : un crème doré très clair (`#fff3d6`), pour les flashs les plus lumineux du thème sombre. Sans elle, ils finissaient en doré pur, trop saturé.
- **Désactivé par défaut**, avec un bouton marche / arrêt (icône étincelles) dans la barre de navigation. Le choix est mémorisé. Le visualiseur peut produire des effets lumineux rapides (accessibilité WCAG 2.3.1) et sollicite la carte graphique : l'utilisateur doit donc l'activer lui-même, et l'infobulle du bouton prévient des effets lumineux.
- **Économe** : il ne dessine que pendant la lecture, avec le bouton activé et l'onglet visible. Il s'efface en fondu à la pause. Il est rendu à 60 % de la résolution de l'écran (le résultat est flou de toute façon). Butterchurn et les presets ne sont **téléchargés qu'à la première utilisation**.
- **7 presets** choisis pour leurs mouvements fluides, sans effet stroboscopique. Ils changent **sur un temps fort, tous les 32 temps**, avec un fondu de 1,2 s (voir la dernière partie, « Amélioration : suivi du rythme »).
- **Battement sur chaque temps fort** : une détection des coups de grosse caisse fait « pulser » le fond (zoom et luminosité) et allume un halo doré sur les bords de l'écran (voir la dernière partie).

Le backend et le contrat HTTP n'ont pas été modifiés.

## Paquets installés

Commande : `npm install butterchurn@2.6.7 butterchurn-presets@2.4.7`

| Paquet | Version | Licence | Ajouté | Rôle |
|---|---|---|---|---|
| `butterchurn` | 2.6.7 | MIT | directement (`dependencies`) | Moteur MilkDrop en WebGL : lit l'audio et dessine les presets. |
| `butterchurn-presets` | 2.4.7 | MIT | directement (`dependencies`) | Bibliothèque de 1754 presets (un fichier JSON par preset). Seuls 7 sont importés. |
| `@babel/runtime` | 7.29.10 | MIT | par `butterchurn` | Fonctions d'aide de Babel utilisées par le code compilé de Butterchurn. |
| `ecma-proposal-math-extensions` | 0.0.2 | MIT | par les deux paquets | Fonctions mathématiques utilisées par les équations des presets. |
| `babel-runtime` | 6.26.0 | MIT | par `butterchurn-presets` | Ancienne version des aides Babel. |
| `core-js` | 2.6.12 | MIT | par `babel-runtime` | Polyfills. |
| `regenerator-runtime` | 0.11.1 | MIT | par `babel-runtime` | Support des générateurs. |
| `lodash` | 4.18.1 | MIT | par `butterchurn-presets` | Fonctions utilitaires. |

Effet sur le poids de l'application : **aucun au chargement initial**. Au premier lancement du visualiseur, le navigateur télécharge Butterchurn (199 Ko, soit 35 Ko compressés) et les 7 presets (2 à 7 Ko chacun). Importer le pack complet de presets aurait ajouté environ 12 Mo.

npm 11 n'exécute plus les scripts d'installation sans autorisation et l'a signalé par des avertissements `install-scripts`. Ils concernent des dépendances d'outils déjà présentes (`lmdb`, `msgpackr-extract`) et le script de remerciement de `core-js`. Aucun n'est nécessaire au fonctionnement, et le build passe.

## Fichiers modifiés

| Fichier | Modifications faites |
|---|---|
| `frontend-starter/package.json` / `package-lock.json` | Ajout de `butterchurn` et `butterchurn-presets` dans `dependencies` (fait par `npm install`), avec les dépendances indirectes listées plus haut dans le lockfile. |
| `frontend-starter/angular.json` | `"allowedCommonJsDependencies": ["butterchurn"]` : Butterchurn est distribué en ancien format CommonJS / UMD. Le build l'accepte, et la déclaration supprime l'avertissement « not ESM ». |
| `frontend-starter/tsconfig.json` | `"resolveJsonModule": true`, pour pouvoir importer les presets, qui sont des fichiers `.json`. |
| `frontend-starter/src/types/butterchurn.d.ts` (nouveau) | Déclaration des types de Butterchurn (`createVisualizer`, `connectAudio`, `disconnectAudio`, `loadPreset`, `setRendererSize`, `render`), car la bibliothèque n'en fournit pas. Sans eux, TypeScript en mode strict refuse l'import. |
| `src/app/shared/services/visualizer.service.ts` (nouveau) | Service `providedIn: 'root'` sur le modèle de `ThemeService` : signal `enabled` (désactivé par défaut) et `toggle()`. Le choix est enregistré sous la clé `gpc_visualizer` du `localStorage`, dans des `try/catch` pour la navigation privée. |
| `src/app/shared/services/audio-context.service.ts` | Ajout du signal `playingSource` : le nœud audio du morceau en cours de lecture, ou `null` en pause. C'est ce qui permet au fond, placé dans `AppComponent`, d'écouter le lecteur, placé dans une carte de la page Backing tracks, avec le même `AudioContext`. |
| `src/app/shared/components/track-player/track-player.ts` | `onPlay()` déclare la `MediaElementAudioSourceNode` du lecteur dans `playingSource`. `onPause()` et la destruction du lecteur la retirent avec `releasePlayingSource()`, seulement si c'est encore la sienne, au cas où un autre lecteur aurait démarré entre-temps. |
| `src/app/shared/components/visualizer-background/visualizer-background.ts` (nouveau) | Composant `app-visualizer-background`. <br>• **Chargement à la demande** : au premier morceau joué avec le bouton activé, `import('butterchurn')` et les presets sont chargés, puis `createVisualizer()` est appelé avec l'`AudioContext` de l'application. Le module UMD est récupéré via `default` ou `default.default`, selon l'interopérabilité du bundler. <br>• **Écoute** : un `effect()` branche Butterchurn sur `playingSource` (`connectAudio` / `disconnectAudio`) et suit le changement de morceau. <br>• **Boucle de dessin** : `requestAnimationFrame`, active seulement quand le `computed` `running` est vrai (activé, chargé, en lecture, onglet visible grâce à `visibilitychange`). La détection du rythme et le changement de preset sont décrits dans la partie « Amélioration : suivi du rythme ». <br>• **Taille** : rendu à 60 % de la taille de la fenêtre, recalculé au `resize`. <br>• **Palette** : `applyPalette()` lit les variables CSS `--viz-0` à `--viz-5`, convertit chaque couleur en RGB (normalisation par un contexte canvas) et remplit les tables du filtre SVG. Un `afterRenderEffect` sur le thème la recalcule quand on passe du clair au sombre. <br>• **Fond de page** : un `effect()` ajoute la classe `viz-on` sur `<html>` tant que le visualiseur est visible. <br>• **Nettoyage** : à la destruction, arrêt de la boucle, déconnexion de l'audio et retrait des écouteurs d'événements. |
| `src/app/shared/components/visualizer-background/visualizer-background.html` (nouveau) | Le filtre SVG `#gpc-visualizer-palette`, en deux étapes : <br>1. `feColorMatrix` calcule la luminosité de chaque pixel (coefficients Rec. 709) en l'augmentant de 50 %, car les images MilkDrop sont surtout sombres ; <br>2. `feComponentTransfer` (`feFuncR/G/B` en mode `table`) transforme cette luminosité en couleur de la palette. <br>`color-interpolation-filters="sRGB"` garde les couleurs exactes du thème. Le `<canvas>` WebGL est dessiné par Butterchurn. |
| `src/app/shared/components/visualizer-background/visualizer-background.css` (nouveau) | Hôte `position: fixed`, en plein écran, `z-index: -1` (derrière toute la page) et `pointer-events: none` (n'empêche aucun clic). Il est invisible par défaut et apparaît en fondu de 0,8 s avec la classe `.visible`, jusqu'à l'opacité `--viz-opacity`. Le canvas utilise `filter: url(#gpc-visualizer-palette)`. Le battement sur les temps forts est décrit dans la partie « Amélioration : suivi du rythme ». |
| `src/app/shared/components/visualizer-background/visualizer-presets.ts` (nouveau) | Les 7 presets, importés un par un en `import()` dynamique depuis `butterchurn-presets/presets/converted/` : *Flexi – mindblob 2.0*, *Flexi + Rovastar – landing on Fractopia*, *Aderrasi – Potion of Spirits*, *Eo.S. – glowsticks v2 02*, *Eo.S. + Geiss – glowsticks v2 03 (water mix)*, *Cope – The Neverending Explosion of Red Liquid Fire*, *Flexi + Geiss – Tokamak mindblob 2.0*. |
| `src/app/components/app/app.html` | Bouton marche / arrêt `.nav-link.theme-toggle` avant le bouton de thème, avec l'icône `sparkles`, `aria-pressed`, un `aria-label` (« Fond animé au rythme de la musique ») et une infobulle qui prévient des effets lumineux rapides. Le bouton prend l'état `.active` quand le visualiseur est activé. Ajout de `<app-visualizer-background />` à la fin du template. |
| `src/app/components/app/app.ts` | Import de `VisualizerBackgroundComponent` et injection de `VisualizerService`. |
| `src/app/shared/components/icon/icon.ts` | Nouvelle icône `sparkles` (deux étoiles), pour le bouton du fond animé. |
| `src/styles.css` | Variables de la palette du visualiseur `--viz-0` à `--viz-5` et `--viz-opacity`, dans le thème clair (`0.7`) et le thème sombre (`0.85`). Règles `:root.viz-on` : fond du `body` transparent pour laisser voir le visualiseur, et cartes légèrement transparentes (86 %, `color-mix`) avec un flou d'arrière-plan (`backdrop-filter: blur(10px)`) pour garder le texte lisible. |

## Vérification

- `npm run build` : compilation réussie, **sans avertissement**. Butterchurn et chaque preset sont dans des fichiers séparés, chargés à la demande.
- `npm test` ne peut toujours pas s'exécuter : `jsdom` n'est pas installé dans le projet (problème antérieur à ce changement).
- **Test dans Chrome**, avec WebGL activé (SwiftShader), l'application servie par `ng serve` et un **faux backend local**. Ce faux backend fournit deux morceaux générés avec grosse caisse, basse et charleston à 120 BPM : la vraie base n'a pas été touchée et aucun compte n'a été créé. Résultats :
  - avant la lecture : visualiseur invisible (opacité 0) ;
  - pendant la lecture : classe `viz-on` sur `<html>`, opacité 0,85 en sombre, canvas de 768 × 454 pour une fenêtre de 1280 × 757 (60 %) ;
  - six captures sur 10 s : formes liquides MilkDrop qui changent en continu, **uniquement en bleu marine, bleu, doré et crème** ;
  - pause : le visualiseur disparaît en fondu et la classe `viz-on` est retirée ;
  - passage au thème clair pendant la lecture : la palette est recalculée (voile bleu pâle et touches dorées) et l'opacité passe à 0,7 ;
  - bouton marche / arrêt : le visualiseur s'arrête même pendant la lecture, et `gpc_visualizer` vaut `off` dans le `localStorage` ;
  - **aucune erreur ni avertissement dans la console**.
- Réglage fait après le premier test : en thème sombre, le fond restait presque uniformément bleu nuit. La luminosité est maintenant augmentée de 50 % avant l'application de la palette, ce qui fait ressortir le bleu et le doré.
- À vérifier avec le vrai backend et un vrai morceau : la réaction au rythme sur de la vraie musique, et la fluidité sur un ordinateur moins puissant ou un téléphone.

# Amélioration : suivi du rythme

## Prompt
Modifie le design du MilkDrop car il ne suit pas trop le rythme de la musique, et mets à jour le rapport.md.

## Pourquoi le fond suivait mal le rythme

1. **Les presets** : choisis « fluides, sans stroboscope », ils ondulent en continu mais réagissent peu aux coups de grosse caisse.
2. **La palette** : beaucoup de presets marquent le temps par un changement de **couleur**. La gradient map ne garde que la luminosité, donc ce changement disparaissait.
3. **Les cartes** couvrent le centre de la page, là où l'animation MilkDrop est la plus forte.
4. **Le changement de preset** se faisait sur un minuteur de 25 s, sans lien avec la musique.

## Ce qui change

Une **détection des temps forts** a été ajoutée, en plus des réactions propres à MilkDrop :
- **Comment** : le son passe par un filtre passe-bas à 150 Hz (il ne reste que la grosse caisse et la basse), puis on mesure son énergie (RMS au carré) 50 fois par seconde. Un **temps fort** est une énergie supérieure à 1,6 fois sa moyenne de la dernière seconde, hors silence.
- **À chaque temps** : la variable CSS `--viz-pulse` passe à 1 puis redescend en douceur (environ 0,2 s). Le CSS la transforme en :
  - un **« punch »** du fond : zoom de 3,5 % et luminosité augmentée de 45 %, ce qui fait monter les pixels clairs dans la palette, vers le doré et le crème ;
  - un **halo doré** (`--accent`) sur les **bords de l'écran**, la zone que les cartes ne cachent jamais.
- **Entre les temps** : `--viz-level` (le niveau des basses) éclaircit légèrement le fond, qui « respire » avec la basse.
- **Les presets changent sur un temps fort, tous les 32 temps** (environ 16 s à 120 BPM), avec un fondu court de 1,2 s : la transition tombe avec la musique. Un morceau calme sans temps détecté change quand même de preset au bout de 30 s.
- **Sécurité** : au moins 350 ms entre deux temps, donc **moins de 3 flashs par seconde** (limite WCAG 2.3.1). Avec `prefers-reduced-motion`, le zoom et le halo sont désactivés et seule l'animation MilkDrop reste.

## Fichiers modifiés

| Fichier | Modifications faites |
|---|---|
| `src/app/shared/components/visualizer-background/visualizer-background.ts` | **Nouvelle chaîne audio de détection** : `BiquadFilterNode` passe-bas 150 Hz → `AnalyserNode` (1024 échantillons), branchée et débranchée sur la source en lecture en même temps que Butterchurn, dans `connect()`. <br>• **`followRhythm()`** : lit la forme d'onde des basses (`getFloatTimeDomainData`) et calcule le RMS et l'énergie. Elle compare l'énergie à la moyenne glissante d'environ 1 s (`AVERAGE_WEIGHT = 0.02`), puis appelle `onBeat()` si `énergie > 1,6 × moyenne`, `RMS > 0,04` et 350 ms depuis le dernier temps. <br>• **`onBeat()`** : `pulse = 1`, compte les temps, et passe au preset suivant au 32ᵉ. <br>• **`nextPreset()`** : changement avec un fondu de 1,2 s. Il est aussi appelé au bout de 30 s sans changement (morceau sans temps détecté). <br>• **`setRhythmVariables()`** : écrit `--viz-pulse` et `--viz-level` directement dans le style de l'hôte, sans passer par la détection de changements d'Angular. <br>• La détection tourne sur **son propre minuteur à 50 Hz** (`setInterval` de 20 ms), séparé de la boucle de dessin. <br>• La décroissance du pulse dépend du **temps réellement écoulé**, et elle est appliquée **avant** la détection, pour qu'un temps s'affiche à pleine intensité. <br>• Suppression de l'ancien minuteur de 25 s. |
| `src/app/shared/components/visualizer-background/visualizer-background.css` | Variables `--viz-pulse` et `--viz-level` (0 par défaut). Sur le canvas, `brightness()` (1 + 0,45 × pulse + 0,25 × niveau) ajouté après le filtre de palette, et `transform: scale()` de 1,02 à 1,055 ; la marge de 2 % évite de voir les bords pendant le zoom. Pseudo-élément `:host::after` : dégradé radial transparent au centre, `--viz-beat-glow` sur les bords, avec une opacité de 0,8 × pulse. `overflow: hidden` sur l'hôte pour que le zoom ne déborde pas. Bloc `@media (prefers-reduced-motion: reduce)` qui retire le zoom et le halo. |
| `src/styles.css` | Nouvelle variable `--viz-beat-glow`, la couleur du halo : `--accent` en thème sombre, et `--accent` à 75 % (`color-mix`) en thème clair, plus doux sur fond clair. |

Aucun nouveau paquet installé.

## Vérification

- `npm run build` : compilation réussie, sans avertissement.
- **Mesure de la détection** dans Chrome, avec le faux backend local : morceau généré à **120 BPM**, donc un coup de grosse caisse toutes les 500 ms. On relève l'instant de chaque temps détecté pendant 6 s :
  - **précision** : les temps détectés sont espacés de **480 à 524 ms**, donc bien calés sur la grosse caisse ;
  - **aucune fausse détection** ;
  - environ 1 temps sur 6 manqué (écart de ~1000 ms). Avec un seuil de 1,4, les manques augmentaient sur cette machine : 1,6 est conservé.
- **Bugs trouvés et corrigés grâce à ces mesures** :
  1. Première version avec `getByteFrequencyData` : **0 temps détecté**. Ces valeurs sont des décibels plafonnés à 255 ; la ligne de basse saturait la bande en continu, donc la grosse caisse ne pouvait jamais dépasser la moyenne. Remplacé par l'énergie réelle du signal filtré.
  2. La détection était faite à chaque image dessinée. Le Chrome de test, sans carte graphique, ne dessinait qu'**environ 4 images par seconde** et ratait les coups. Ce serait aussi le cas sur un ordinateur lent ou un téléphone. La détection a désormais son propre minuteur à 50 Hz.
  3. Le pulse ne dépassait jamais 0,84, car la décroissance s'appliquait juste après un temps. L'ordre est corrigé et le pic atteint 1.
- **Rendu** : comparaison avec le pulse forcé à 0 puis à 1. Sur un temps fort, le halo doré envahit les bords et le fond s'éclaircit ; entre deux temps, il reste bleu nuit.
- Aucune erreur ni avertissement dans la console.
- À vérifier avec le vrai backend : le réglage du seuil (1,6) sur de la vraie musique, surtout sur des morceaux sans grosse caisse marquée (ballade, guitare seule). Dans ce cas, seul le changement de preset toutes les 30 s s'applique.
