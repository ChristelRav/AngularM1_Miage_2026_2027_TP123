import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { Category, parseCategoryIds } from "../src/models/Category.js";
import { Track } from "../src/models/Track.js";
import { migrateTrackCategories } from "../src/migrations/migrate-track-categories.js";
import { DEFAULT_CATEGORIES, ensureDefaultCategories } from "../src/seeds/categories.seed.js";

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test("les routes des catégories exigent une authentification", async () => {
  const id = "507f1f77bcf86cd799439011";
  assert.equal((await fetch(base + "/api/categories")).status, 401);
  assert.equal((await fetch(`${base}/api/tracks/${id}/categories`)).status, 401);
  const update = await fetch(`${base}/api/tracks/${id}/categories`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryIds: [] }),
  });
  assert.equal(update.status, 401);
});

test("seul le dossier des images de catégories est public", async () => {
  // Une image absente renvoie 404 sans faire planter l'API.
  assert.equal((await fetch(base + "/uploads/categories/inexistante.jpg")).status, 404);
  // Les fichiers audio des utilisateurs ne sont pas exposés.
  assert.equal((await fetch(base + "/uploads/song.mp3")).status, 404);
  assert.equal((await fetch(base + "/uploads/categories/../song.mp3")).status, 404);
});

test("données du seed : 52 catégories, slugs uniques, images en chemin", () => {
  assert.equal(DEFAULT_CATEGORIES.length, 52);
  const slugs = DEFAULT_CATEGORIES.map((category) => category.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  const count = (type) => DEFAULT_CATEGORIES.filter((c) => c.type === type).length;
  assert.deepEqual([count("GENRE"), count("MOOD"), count("THEME")], [21, 13, 18]);
  for (const category of DEFAULT_CATEGORIES) {
    assert.equal(category.image.url, `/uploads/categories/${category.slug}.jpg`);
    assert.ok(category.image.alt && category.description);
    if (category.parentSlug) assert.ok(slugs.includes(category.parentSlug));
  }
});

test("schémas Category et Track.categoryIds", () => {
  assert.equal(Category.schema.path("slug").options.unique, true);
  assert.deepEqual(Category.schema.path("type").enumValues, ["GENRE", "MOOD", "THEME"]);
  assert.equal(Category.schema.path("parentId").options.ref, "Category");
  assert.equal(Category.schema.path("isActive").defaultValue, true);
  assert.ok(Category.schema.options.timestamps);
  assert.equal(new Category({ name: "x", slug: "a b", type: "GENRE" }).validateSync()?.errors.slug?.kind, "regexp");
  assert.ok(new Category({ name: "x", slug: "x", type: "AUTRE" }).validateSync().errors.type);

  // Les catégories sont un tableau d'ObjectId dans Track, vide par défaut.
  assert.equal(Track.schema.path("categoryIds").instance, "Array");
  assert.equal(Track.schema.path("categoryIds").embeddedSchemaType.options.ref, "Category");
  const track = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Sans catégorie",
    originalName: "a.mp3",
    storedName: "a.mp3",
    mimeType: "audio/mpeg",
    size: 1,
  });
  assert.deepEqual(track.toPublic().categoryIds, []);
  const pop = new mongoose.Types.ObjectId();
  track.categoryIds = [pop];
  assert.deepEqual(track.toPublic().categoryIds, [String(pop)]);
});

/** Base en mémoire avec uniquement les opérations utilisées par la migration. */
function fakeDb({ tracks, links }) {
  const data = { tracks, trackcategories: links };
  const matches = (doc, filter) =>
    Object.entries(filter).every(([key, condition]) => {
      if (condition?.$in) return condition.$in.some((value) => String(value) === String(doc[key]));
      if (condition?.$exists === false) return doc[key] === undefined;
      return String(doc[key]) === String(condition);
    });
  return {
    data,
    listCollections: ({ name }) => ({ toArray: async () => (data[name] ? [{ name }] : []) }),
    collection: (name) => ({
      find: (filter) => ({ toArray: async () => data[name].filter((doc) => matches(doc, filter)) }),
      updateOne: async (filter, update) => {
        const doc = data[name].find((item) => matches(item, filter));
        const before = (doc.categoryIds ?? []).length;
        doc.categoryIds = doc.categoryIds ?? [];
        for (const id of update.$addToSet.categoryIds.$each) {
          if (!doc.categoryIds.some((current) => String(current) === String(id))) doc.categoryIds.push(id);
        }
        return { modifiedCount: doc.categoryIds.length === before ? 0 : 1 };
      },
      updateMany: async (filter, update) => {
        const docs = data[name].filter((doc) => matches(doc, filter));
        for (const doc of docs) Object.assign(doc, structuredClone(update.$set));
        return { modifiedCount: docs.length };
      },
      drop: async () => delete data[name],
    }),
  };
}

test("migration trackcategories -> tracks.categoryIds : copie, vérifie puis supprime", async () => {
  const [t1, t2, t3, pop, noel, rock] = Array.from({ length: 6 }, () => new mongoose.Types.ObjectId());
  const db = fakeDb({
    tracks: [
      { _id: t1, title: "Avec catégories", categoryIds: [pop], updatedAt: "inchangé" },
      { _id: t2, title: "Ancien format" },
      { _id: t3, title: "Sans catégorie" },
    ],
    links: [
      { trackId: t1, categoryId: pop },
      { trackId: t1, categoryId: noel },
      { trackId: t2, categoryId: rock },
    ],
  });

  const dry = await migrateTrackCategories({ db, dryRun: true });
  assert.equal(dry.links, 3);
  assert.equal(dry.legacyDropped, false);
  assert.equal(db.data.tracks[1].categoryIds, undefined);

  const result = await migrateTrackCategories({ db });
  assert.equal(result.verifiedLinks, 3);
  assert.equal(result.verified, true);
  assert.equal(result.legacyDropped, true);
  assert.equal(db.data.trackcategories, undefined);
  // pop n'est pas dupliqué, les autres champs ne changent pas.
  assert.deepEqual(db.data.tracks[0].categoryIds.map(String), [String(pop), String(noel)]);
  assert.equal(db.data.tracks[0].updatedAt, "inchangé");
  assert.deepEqual(db.data.tracks[1].categoryIds.map(String), [String(rock)]);
  assert.deepEqual(db.data.tracks[2].categoryIds, []);

  // Relancer la migration ne fait rien de plus.
  const again = await migrateTrackCategories({ db });
  assert.equal(again.legacyExists, false);
  assert.equal(again.links, 0);
});

test("migration : trackcategories est conservée si une association ne peut pas être copiée", async () => {
  const [track, pop] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const db = fakeDb({
    tracks: [{ _id: track, title: "Existante" }],
    links: [
      { trackId: track, categoryId: pop },
      { trackId: new mongoose.Types.ObjectId(), categoryId: pop }, // piste supprimée
    ],
  });
  const result = await migrateTrackCategories({ db });
  assert.equal(result.orphanLinks, 1);
  assert.equal(result.verified, false);
  assert.equal(result.legacyDropped, false);
  assert.equal(db.data.trackcategories.length, 2);
});

test("parseCategoryIds : facultatif, dédoublonné, rejet des valeurs invalides", () => {
  const id = "507f1f77bcf86cd799439011";
  assert.deepEqual(parseCategoryIds(undefined), []);
  assert.deepEqual(parseCategoryIds(id), [id]);
  assert.deepEqual(parseCategoryIds([id, id]), [id]);
  assert.equal(parseCategoryIds(["pas-un-id"]), null);
  assert.equal(parseCategoryIds([{ $ne: null }]), null);
});

test(
  "seed sans doublon, upload multi-catégories, modification et suppression (MONGODB_TEST_URI requis)",
  { skip: !process.env.MONGODB_TEST_URI },
  async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI);
    const ownerId = new mongoose.Types.ObjectId();
    const token = jwt.sign(
      { sub: ownerId.toString(), email: "categories@example.com" },
      process.env.JWT_SECRET || "tp1-development-secret",
    );
    const auth = { Authorization: `Bearer ${token}` };
    const json = { ...auth, "Content-Type": "application/json" };
    const createdTrackIds = [];

    try {
      // 1 et 2 : deux initialisations ne créent pas de doublon.
      await ensureDefaultCategories();
      await ensureDefaultCategories();
      const slugs = DEFAULT_CATEGORIES.map((category) => category.slug);
      assert.equal(await Category.countDocuments({ slug: { $in: slugs } }), 52);
      const metal = await Category.findOne({ slug: "metal" });
      const rock = await Category.findOne({ slug: "rock" });
      assert.equal(String(metal.parentId), String(rock._id));

      const genres = await (await fetch(base + "/api/categories?type=genre", { headers: auth })).json();
      assert.ok(genres.length >= 21 && genres.every((c) => c.type === "GENRE"));
      assert.equal((await fetch(base + "/api/categories?type=AUTRE", { headers: auth })).status, 400);

      const ids = Object.fromEntries(
        (await Category.find({ slug: { $in: ["pop", "r-and-b", "romantique", "joyeuse", "saint-valentin"] } }))
          .map((category) => [category.slug, String(category._id)]),
      );

      // 3 et 4 : upload avec plusieurs catégories.
      const form = new FormData();
      form.append("audio", new Blob(["audio"], { type: "audio/mpeg" }), "love.mp3");
      form.append("title", "Love song");
      for (const id of Object.values(ids)) form.append("categoryIds", id);
      const created = await fetch(base + "/api/tracks", { method: "POST", headers: auth, body: form });
      assert.equal(created.status, 201);
      const track = await created.json();
      createdTrackIds.push(track.id);
      assert.equal(track.categories.length, 5);
      assert.equal(track.categoryIds.length, 5);
      assert.equal((await Track.findById(track.id).lean()).categoryIds.length, 5);

      // Upload sans catégorie et upload avec une catégorie inconnue.
      const plain = new FormData();
      plain.append("audio", new Blob(["audio"], { type: "audio/mpeg" }), "plain.mp3");
      const plainResponse = await fetch(base + "/api/tracks", { method: "POST", headers: auth, body: plain });
      assert.equal(plainResponse.status, 201);
      const plainTrack = await plainResponse.json();
      createdTrackIds.push(plainTrack.id);
      assert.deepEqual(plainTrack.categories, []);
      assert.deepEqual((await Track.findById(plainTrack.id).lean()).categoryIds, []);

      const bad = new FormData();
      bad.append("audio", new Blob(["audio"], { type: "audio/mpeg" }), "bad.mp3");
      bad.append("categoryIds", new mongoose.Types.ObjectId().toString());
      assert.equal((await fetch(base + "/api/tracks", { method: "POST", headers: auth, body: bad })).status, 400);

      // 5 : modification des catégories.
      const updated = await fetch(`${base}/api/tracks/${track.id}/categories`, {
        method: "PUT",
        headers: json,
        body: JSON.stringify({ categoryIds: [ids.pop, ids.joyeuse] }),
      });
      assert.equal(updated.status, 200);
      assert.deepEqual((await updated.json()).map((c) => c.slug).sort(), ["joyeuse", "pop"]);
      const read = await (await fetch(`${base}/api/tracks/${track.id}/categories`, { headers: auth })).json();
      assert.equal(read.length, 2);

      // 6 : une ancienne piste (sans liaison) reste listée avec categories = [].
      const legacyId = new mongoose.Types.ObjectId();
      createdTrackIds.push(String(legacyId));
      await Track.collection.insertOne({
        _id: legacyId,
        ownerId,
        title: "Ancienne piste",
        originalName: "old.mp3",
        storedName: "old.mp3",
        mimeType: "audio/mpeg",
        size: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const list = await (await fetch(base + "/api/tracks?limit=20", { headers: auth })).json();
      const legacy = list.items.find((item) => item.id === String(legacyId));
      assert.deepEqual(legacy.categories, []);
      assert.deepEqual(legacy.categoryIds, []);
      assert.equal(list.items.find((item) => item.id === track.id).categories.length, 2);

      assert.deepEqual(
        (await Track.findById(track.id).lean()).categoryIds.map(String).sort(),
        [ids.pop, ids.joyeuse].sort(),
      );

      // Les catégories disparaissent avec la piste (elles sont dans son document).
      const removed = await fetch(`${base}/api/tracks/${track.id}`, { method: "DELETE", headers: auth });
      assert.equal(removed.status, 204);
      createdTrackIds.splice(createdTrackIds.indexOf(track.id), 1);
      assert.equal(await Track.exists({ _id: track.id }), null);
    } finally {
      for (const id of createdTrackIds) {
        await fetch(`${base}/api/tracks/${id}`, { method: "DELETE", headers: auth });
      }
      await Track.deleteMany({ ownerId });
      await mongoose.disconnect();
    }
  },
);
