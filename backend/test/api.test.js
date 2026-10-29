import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Acces, ensureDefaultAcces } from "../src/models/Acces.js";
import { migrateTracksWithoutAcces } from "../src/migrations/migrate-tracks-access.js";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Track } from "../src/models/Track.js";

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test("health sans dépendre de MongoDB", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "ok");
});

test("les routes des accès exigent une authentification", async () => {
  const list = await fetch(base + "/api/acces");
  assert.equal(list.status, 401);

  const create = await fetch(base + "/api/acces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accesName: "test" }),
  });
  assert.equal(create.status, 401);
});

test("schémas Mongoose et relation", () => {
  const u = new User({
    name: "Test",
    email: "TEST@example.com",
    password: "12345678",
  });

  assert.equal(u.email, "test@example.com");
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
  });
  
  assert.equal(t.title, "Blues");
  assert.equal(t.toPublic().coverUrl, null);
  t.coverStoredName = "cover.jpg";
  assert.equal(t.toPublic().coverUrl, `/api/tracks/${t.id}/cover`);
  assert.equal(Track.schema.path("ownerId").options.ref, "User");
  assert.equal(Track.schema.path("accesId").instance, "ObjectId");
  assert.equal(Track.schema.path("accesId").options.ref, "Acces");
  assert.notEqual(Track.schema.path("accesId").isRequired, true);
  assert.equal(t.accesId, undefined);
  assert.equal(Acces.schema.options.collection, "acces");
  assert.equal(Acces.schema.path("accesName").isRequired, true);
  assert.equal(Acces.schema.path("accesName").options.unique, true);
  assert.equal(Acces.schema.path("id"), undefined);

  const privateAccess = new Acces({ accesName: "privé" });
  assert.ok(mongoose.isValidObjectId(privateAccess._id));
  assert.equal(privateAccess.toPublic()._id, String(privateAccess._id));
  assert.equal(privateAccess.toPublic().accesName, "privé");
});

test("migration sans accès privé : arrêt sans modifier les tracks", async () => {
  const originalFindOne = Acces.findOne;
  let updateCalled = false;
  Acces.findOne = () => ({ select: async () => null });
  try {
    const track = new Track({
      ownerId: new mongoose.Types.ObjectId(),
      title: "Sans accès privé",
      originalName: "no-private.mp3",
      storedName: "no-private.mp3",
      mimeType: "audio/mpeg",
      size: 10,
    });
    await assert.rejects(track.validate(), /L'accès privé par défaut n'est pas configuré/);
    await assert.rejects(
      migrateTracksWithoutAcces({
        AccesModel: {
          findOne: () => ({ select: async () => null }),
        },
        TrackModel: {
          updateMany: async () => {
            updateCalled = true;
          },
        },
      }),
      /Accès "privé" introuvable/,
    );
    assert.equal(updateCalled, false);
  } finally {
    Acces.findOne = originalFindOne;
  }
});

test("migration : cible uniquement les tracks sans accesId", async () => {
  const privateAccessId = new mongoose.Types.ObjectId();
  let updateFilter;
  let updateOperation;
  const result = await migrateTracksWithoutAcces({
    AccesModel: {
      findOne: () => ({ select: async () => ({ _id: privateAccessId }) }),
    },
    TrackModel: {
      updateMany: async (filter, update) => {
        updateFilter = filter;
        updateOperation = update;
        return { matchedCount: 2, modifiedCount: 2 };
      },
    },
  });

  assert.deepEqual(updateFilter, {
    $or: [{ accesId: { $exists: false } }, { accesId: null }],
  });
  assert.deepEqual(updateOperation, { $set: { accesId: privateAccessId } });
  assert.deepEqual(result, {
    accesId: String(privateAccessId),
    matchedCount: 2,
    modifiedCount: 2,
  });
});

test(
  "création, migration et populate des accès (MONGODB_TEST_URI requis)",
  { skip: !process.env.MONGODB_TEST_URI },
  async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI);

    const ownerId = new mongoose.Types.ObjectId();
    const trackIds = [];
    const uploadedTrackIds = [];
    let privateAccess;
    let customAccessId;
    let integrationServer;
    let integrationBase;
    let token;

    try {
      await Promise.all([Acces.init(), Track.init()]);
      await ensureDefaultAcces();
      privateAccess = await Acces.findOne({ accesName: "privé" });

      integrationServer = createApp().listen(0);
      await new Promise((resolve) => integrationServer.once("listening", resolve));
      integrationBase = `http://127.0.0.1:${integrationServer.address().port}`;
      token = jwt.sign(
        { sub: ownerId.toString(), email: "integration@example.com" },
        process.env.JWT_SECRET || "tp1-development-secret",
      );
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const accessResponse = await fetch(integrationBase + "/api/acces", {
        method: "POST",
        headers,
        body: JSON.stringify({ accesName: `integration-${Date.now()}` }),
      });
      assert.equal(accessResponse.status, 201);
      const customAccess = await accessResponse.json();
      customAccessId = customAccess._id;
      assert.ok(mongoose.isValidObjectId(customAccessId));

      const duplicateResponse = await fetch(integrationBase + "/api/acces", {
        method: "POST",
        headers,
        body: JSON.stringify({ accesName: customAccess.accesName }),
      });
      assert.equal(duplicateResponse.status, 409);

      const accessesResponse = await fetch(integrationBase + "/api/acces", {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(accessesResponse.status, 200);
      const accesses = await accessesResponse.json();
      assert.ok(["privé", "public", "friendly"].every((name) =>
        accesses.some((item) => item.accesName === name),
      ));
      assert.ok(accesses.every((item) => mongoose.isValidObjectId(item._id)));
      assert.ok(accesses.some((item) => item._id === customAccessId));

      async function uploadTrack(title, accesId) {
        const form = new FormData();
        form.append(
          "audio",
          new Blob(["test audio"], { type: "audio/mpeg" }),
          `${title}.mp3`,
        );
        form.append("title", title);
        if (accesId) form.append("accesId", accesId);

        const response = await fetch(integrationBase + "/api/tracks", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        assert.equal(response.status, 201);
        return response.json();
      }

      const defaultTrack = await uploadTrack("Integration privée");
      uploadedTrackIds.push(defaultTrack.id);
      const assignedTrack = await uploadTrack("Integration associée", customAccessId);
      uploadedTrackIds.push(assignedTrack.id);
      assert.equal(defaultTrack.accesId._id, String(privateAccess._id));
      assert.equal(assignedTrack.accesId._id, customAccessId);

      const legacyTrackId = new mongoose.Types.ObjectId();
      trackIds.push(legacyTrackId);
      await Track.collection.insertOne({
        _id: legacyTrackId,
        ownerId,
        title: "Integration ancienne sans accès",
        originalName: "legacy.mp3",
        storedName: "legacy.mp3",
        mimeType: "audio/mpeg",
        size: 36,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const migration = await migrateTracksWithoutAcces();
      assert.equal(migration.accesId, String(privateAccess._id));
      assert.equal(migration.modifiedCount, 1);
      const migratedTrack = await Track.findById(legacyTrackId);
      assert.equal(String(migratedTrack.accesId), String(privateAccess._id));
      const stillAssignedTrack = await Track.findById(assignedTrack.id);
      assert.equal(String(stillAssignedTrack.accesId), customAccessId);

      const tracksResponse = await fetch(integrationBase + "/api/tracks?limit=20", {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(tracksResponse.status, 200);
      const { items } = await tracksResponse.json();
      const returnedDefaultTrack = items.find((item) => item.id === defaultTrack.id);
      const returnedAssignedTrack = items.find(
        (item) => item.id === assignedTrack.id,
      );
      assert.equal(returnedDefaultTrack.accesId.accesName, "privé");
      assert.equal(returnedAssignedTrack.accesId._id, customAccessId);
      assert.equal(returnedAssignedTrack.accesId.accesName, customAccess.accesName);
    } finally {
      if (integrationServer?.listening) {
        for (const trackId of uploadedTrackIds) {
          const response = await fetch(`${integrationBase}/api/tracks/${trackId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          assert.equal(response.status, 204);
        }
        await new Promise((resolve) => integrationServer.close(resolve));
      }
      if (trackIds.length) await Track.deleteMany({ _id: { $in: trackIds } });
      if (customAccessId) await Acces.deleteOne({ _id: customAccessId });
      await mongoose.disconnect();
    }
  },
);
