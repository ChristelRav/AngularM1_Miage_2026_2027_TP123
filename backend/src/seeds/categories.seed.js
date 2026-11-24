import fs from "node:fs";
import path from "node:path";
import { Category } from "../models/Category.js";

/*
 * Catégories créées au démarrage du backend. Le slug sert de clé unique :
 * une catégorie déjà présente n'est ni dupliquée ni modifiée.
 *
 * Les images sont attendues dans backend/data/uploads/categories/<slug>.jpg et
 * servies publiquement sous /uploads/categories/<slug>.jpg. Une image absente
 * ne bloque pas le démarrage : Angular affiche alors une vignette de remplacement.
 */
export const CATEGORY_IMAGES_DIR = path.resolve("data/uploads/categories");

// [nom, slug, description, texte alternatif de l'image, slug du parent]
const GENRES = [
  ["Pop", "pop", "Mélodies accrocheuses et refrains faciles à retenir.", "Chanteuse pop sur une scène éclairée de néons colorés"],
  ["Rock", "rock", "Guitares électriques, batterie puissante et énergie brute.", "Guitare électrique branchée sur un ampli"],
  ["Métal", "metal", "Sous-genre du rock aux guitares saturées et au tempo intense.", "Guitariste de métal aux cheveux longs sous des projecteurs rouges", "rock"],
  ["Hip-Hop", "hip-hop", "Culture urbaine mêlant beats, samples et flow.", "Platines de DJ et casquette posées sur un vinyle"],
  ["Rap", "rap", "Paroles scandées en rythme sur une production hip-hop.", "Rappeur tenant un micro devant un public", "hip-hop"],
  ["R&B", "r-and-b", "Rythmes soul et voix suaves aux influences groove.", "Micro vintage baigné d'une lumière violette"],
  ["Jazz", "jazz", "Improvisation, swing et harmonies riches.", "Saxophone doré dans un club de jazz enfumé"],
  ["Blues", "blues", "Musique de l'âme née dans le sud des États-Unis.", "Guitare acoustique usée posée sur une chaise en bois"],
  ["K-pop", "k-pop", "Pop coréenne aux chorégraphies millimétrées.", "Groupe de K-pop dansant sur une scène lumineuse", "pop"],
  ["J-pop", "j-pop", "Pop japonaise colorée et mélodique.", "Rue de Tokyo illuminée la nuit", "pop"],
  ["C-pop", "c-pop", "Pop chinoise, de Mandopop à Cantopop.", "Lanternes rouges suspendues au-dessus d'une scène", "pop"],
  ["Électro", "electro", "Sons synthétiques et rythmes produits par ordinateur.", "Synthétiseur aux touches éclairées de bleu"],
  ["House", "house", "Électro au tempo régulier, née dans les clubs de Chicago.", "Piste de danse sous une boule à facettes", "electro"],
  ["Techno", "techno", "Électro répétitive et hypnotique, venue de Détroit.", "Hangar plongé dans des lasers verts", "electro"],
  ["Classique", "classique", "Œuvres orchestrales et musique de chambre.", "Violon posé sur une partition"],
  ["Folk", "folk", "Chansons acoustiques inspirées des traditions populaires.", "Feu de camp avec une guitare acoustique"],
  ["Country", "country", "Ballades américaines, banjo et chapeau de cow-boy.", "Chapeau de cow-boy sur une barrière en bois au coucher du soleil"],
  ["Reggae", "reggae", "Rythmes jamaïcains décontractés et messages positifs.", "Plage ensoleillée aux couleurs vert, jaune et rouge"],
  ["Afrobeat", "afrobeat", "Percussions africaines, cuivres et groove irrésistible.", "Percussionniste jouant du djembé"],
  ["Gospel", "gospel", "Chants religieux portés par des chœurs puissants.", "Chorale en robes chantant dans une église"],
  ["Chanson française", "chanson-francaise", "Textes poétiques et mélodies de la tradition française.", "Accordéon devant la tour Eiffel"],
];

const MOODS = [
  ["Joyeuse", "joyeuse", "Des morceaux lumineux qui donnent le sourire.", "Personne souriante sautant dans un champ de fleurs"],
  ["Triste", "triste", "Des titres pour accompagner les moments difficiles.", "Fenêtre couverte de gouttes de pluie"],
  ["Mélancolique", "melancolique", "Une douce nostalgie teintée de tristesse.", "Silhouette regardant la mer par temps gris"],
  ["Énergique", "energique", "Du rythme et de la puissance pour se lancer.", "Éclair stylisé sur fond orange vif"],
  ["Relaxante", "relaxante", "Des sonorités apaisantes pour décompresser.", "Hamac entre deux palmiers au bord de l'eau"],
  ["Romantique", "romantique", "Des morceaux pour les moments à deux.", "Dîner aux chandelles avec deux verres"],
  ["Sombre", "sombre", "Des ambiances graves et inquiétantes.", "Forêt brumeuse la nuit"],
  ["Motivante", "motivante", "De quoi se dépasser et atteindre ses objectifs.", "Coureur atteignant le sommet d'une colline au lever du soleil"],
  ["Festive", "festive", "Des titres pour faire la fête et danser.", "Confettis et ballons colorés dans les airs"],
  ["Nostalgique", "nostalgique", "Des souvenirs qui reviennent en musique.", "Vieux walkman et cassette audio"],
  ["Sensuelle", "sensuelle", "Des rythmes lents et envoûtants.", "Silhouette dansant dans une lumière rouge tamisée"],
  ["Épique", "epique", "Des envolées grandioses dignes d'une bande originale.", "Montagnes enneigées sous un ciel dramatique"],
  ["Méditative", "meditative", "Des sons calmes pour la méditation et la concentration.", "Personne en position de méditation face à un lac"],
];

const THEMES = [
  ["Noël", "noel", "Chansons de fêtes de fin d'année.", "Sapin de Noël décoré et cadeaux"],
  ["Saint-Valentin", "saint-valentin", "Les plus belles chansons d'amour.", "Cœur rouge entouré de roses"],
  ["Halloween", "halloween", "Musiques effrayantes et ambiance de citrouilles.", "Citrouilles sculptées éclairées à la bougie"],
  ["Anniversaire", "anniversaire", "Pour souffler les bougies en musique.", "Gâteau d'anniversaire avec des bougies allumées"],
  ["Été et vacances", "ete-et-vacances", "Les tubes du soleil et des vacances.", "Lunettes de soleil et ballon sur le sable"],
  ["Sport et motivation", "sport-et-motivation", "Pour s'entraîner et se dépasser.", "Haltères et chaussures de course dans une salle de sport"],
  ["Amitié", "amitie", "Des chansons qui célèbrent les amis.", "Groupe d'amis se tenant par les épaules"],
  ["Famille", "famille", "Des titres à partager en famille.", "Famille se promenant main dans la main"],
  ["Rupture amoureuse", "rupture-amoureuse", "Pour surmonter un chagrin d'amour.", "Cœur brisé dessiné à la craie"],
  ["Voyage", "voyage", "La bande-son des routes et des départs.", "Valise et carte du monde"],
  ["Nature", "nature", "Des morceaux inspirés par la nature.", "Cascade au milieu d'une forêt verdoyante"],
  ["Liberté", "liberte", "Des hymnes à l'indépendance et à l'évasion.", "Oiseaux s'envolant dans un ciel dégagé"],
  ["Enfance", "enfance", "Comptines et souvenirs d'enfance.", "Jouets en bois et dessins d'enfant"],
  ["Religion et spiritualité", "religion-et-spiritualite", "Musiques sacrées et spirituelles.", "Rayons de lumière traversant un vitrail"],
  ["Films et séries", "films-et-series", "Bandes originales du cinéma et des séries.", "Clap de cinéma et pot de pop-corn"],
  ["Jeux vidéo", "jeux-video", "Musiques tirées des jeux vidéo.", "Manette de jeu éclairée de néons"],
  ["Soirée et fête", "soiree-et-fete", "Pour enflammer le dancefloor.", "Foule dansant sous des lumières de concert"],
  ["Mariage", "mariage", "Pour la cérémonie et la première danse.", "Alliances posées sur un bouquet de fleurs blanches"],
];

function toCategories(type, rows) {
  return rows.map(([name, slug, description, alt, parentSlug]) => ({
    name,
    slug,
    type,
    description,
    image: { url: `/uploads/categories/${slug}.jpg`, alt },
    parentSlug: parentSlug ?? null,
  }));
}

export const DEFAULT_CATEGORIES = [
  ...toCategories("GENRE", GENRES),
  ...toCategories("MOOD", MOODS),
  ...toCategories("THEME", THEMES),
];

/**
 * Insère les catégories manquantes sans toucher aux existantes.
 * Les catégories sans parent sont traitées en premier pour que les
 * sous-genres puissent référencer l'_id de leur parent.
 */
export async function ensureDefaultCategories() {
  // Crée l'index unique sur slug avant les upserts (protection contre les doublons).
  await Category.init();

  const ordered = [
    ...DEFAULT_CATEGORIES.filter((category) => !category.parentSlug),
    ...DEFAULT_CATEGORIES.filter((category) => category.parentSlug),
  ];

  let created = 0;
  for (const { parentSlug, ...category } of ordered) {
    let parentId = null;
    if (parentSlug) {
      const parent = await Category.findOne({ slug: parentSlug }).select("_id").lean();
      parentId = parent?._id ?? null;
    }

    // timestamps: false, sinon Mongoose modifierait updatedAt à chaque démarrage ;
    // les deux dates sont donc posées uniquement à l'insertion.
    const now = new Date();
    const result = await Category.updateOne(
      { slug: category.slug },
      {
        $setOnInsert: {
          ...category,
          parentId,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, timestamps: false },
    );
    if (result.upsertedCount) created++;
  }
  console.log(
    `[startup] Catégories : ${created} créée(s), ${ordered.length - created} déjà présente(s)`,
  );

  // Les images sont facultatives : on prépare le dossier et on signale celles qui manquent.
  fs.mkdirSync(CATEGORY_IMAGES_DIR, { recursive: true });
  const missing = DEFAULT_CATEGORIES.filter(
    (category) => !fs.existsSync(path.join(CATEGORY_IMAGES_DIR, `${category.slug}.jpg`)),
  );
  if (missing.length) {
    console.warn(
      `[startup] ${missing.length} image(s) de catégorie absente(s) dans ${CATEGORY_IMAGES_DIR} ` +
        "(une vignette de remplacement sera affichée)",
    );
  }
}
