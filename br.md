Dans le backend Node.js/Express connecté à MongoDB, je souhaite ajouter une nouvelle collection `acces` avec les champs suivants :

- `_id` : identifiant MongoDB généré automatiquement.
- `accesName` : nom de l'accès (String, obligatoire et unique si cela correspond aux conventions du projet). privé(_id=object....), public, friendly et mettre de suite les id des autres (je ne sais pas si cela est possible)

La collection `tracks` existe déjà. Je souhaite établir une relation entre `tracks` et `acces` en ajoutant un champ `accesId` dans le modèle `Track`, qui référence un document de la collection `acces` à l'aide de Mongoose (`ObjectId` et `ref`) et par défaut mettre celui ded privé .

**Consignes :**

1. Analyse d'abord l'architecture existante du projet, notamment les modèles Mongoose, les routes Express, les contrôleurs et les services concernés.
2. Crée le modèle `Acces` en respectant les conventions déjà utilisées dans le projet.
3. Modifie le modèle `Track` existant pour ajouter `accesId` comme référence vers `Acces`, sans supprimer ni modifier les autres champs existants.
4. Préserve la compatibilité avec les anciens documents `tracks` qui ne possèdent pas encore `accesId`.
5. Ajoute, si nécessaire, les routes API permettant de consulter les accès et de créer un accès, en respectant l'organisation actuelle du backend.
6. Permets de récupérer les informations de l'accès associé à un track avec Mongoose `populate()`, si cela correspond au fonctionnement actuel de l'API.
7. Vérifie si les modifications nécessitent une adaptation du frontend Angular ou du contrat API (`API_CONTRACT.md`). Si oui, propose les changements nécessaires sans modifier inutilement les autres fonctionnalités.
8. Respecte les validations, la gestion des erreurs et les conventions de nommage existantes.
9. Ne recrée pas la collection `tracks` et ne supprime aucune donnée existante mettre par défaut id 1.
10. Ajoute ou adapte les tests pertinents pour vérifier la création d'un accès, l'association avec un track et la récupération des données.

**Méthode de travail :**
- Commence par analyser le code existant et présente les fichiers qui devront être modifiés ou créés.
- Explique brièvement les modifications proposées avant de les effectuer dans RAPPORT_IA.md.
- Implémente ensuite les changements de manière cohérente avec l'architecture existante.
- Termine par un résumé des fichiers modifiés, des endpoints ajoutés et des tests à effectuer.

Ne suppose pas que les noms des modèles, des routes ou des champs correspondent exactement à cet exemple : vérifie d'abord le code réel du projet. Ne réécris pas entièrement le backend.

et n'oublie pas de mettre à jour le RAPPORT_IA.md avec le prompt que je t'ai donné et  toutes les détails de smodifications et test faits 