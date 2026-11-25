import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { Friendship, orderedPair } from "../src/models/Friendship.js";
import { Playlist } from "../src/models/Playlist.js";
import { Track } from "../src/models/Track.js";
import { User } from "../src/models/User.js";

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test("les routes des playlists exigent une authentification", async () => {
  const id = "507f1f77bcf86cd799439011";
  const routes = [
    ["GET", "/api/playlists"],
    ["POST", "/api/playlists"],
    ["GET", "/api/playlists/shared"],
    ["GET", `/api/playlists/${id}`],
    ["PATCH", `/api/playlists/${id}`],
    ["DELETE", `/api/playlists/${id}`],
    ["POST", `/api/playlists/${id}/tracks`],
    ["DELETE", `/api/playlists/${id}/tracks/${id}`],
    ["GET", `/api/playlists/${id}/tracks/${id}/audio`],
    ["GET", `/api/playlists/${id}/tracks/${id}/cover`],
    ["GET", `/api/playlists/${id}/shares`],
    ["POST", `/api/playlists/${id}/shares`],
    ["DELETE", `/api/playlists/${id}/shares/${id}`],
  ];
  for (const [method, url] of routes) {
    assert.equal((await fetch(base + url, { method })).status, 401, `${method} ${url}`);
  }
});

test("schéma Playlist : références, valeurs par défaut et validations", async () => {
  assert.equal(Playlist.schema.path("ownerId").options.ref, "User");
  assert.equal(Playlist.schema.path("trackIds").embeddedSchemaType.options.ref, "Track");
  assert.equal(Playlist.schema.path("sharedWith").embeddedSchemaType.options.ref, "User");
  assert.ok(Playlist.schema.options.timestamps);

  const owner = new mongoose.Types.ObjectId();
  const friend = new mongoose.Types.ObjectId();
  const track = new mongoose.Types.ObjectId();
  const empty = new Playlist({ ownerId: owner, name: "  Mes favoris  " });
  await empty.validate();
  assert.equal(empty.name, "Mes favoris");
  assert.deepEqual([empty.trackIds.length, empty.sharedWith.length], [0, 0], "une playlist peut être vide");

  await assert.rejects(new Playlist({ ownerId: owner, name: "   " }).validate(), /name/);
  await assert.rejects(new Playlist({ ownerId: owner, name: "x".repeat(81) }).validate(), /80 caractères/);
  await assert.rejects(new Playlist({ ownerId: owner, name: "A", trackIds: [track, track] }).validate(), /en double/);
  await assert.rejects(new Playlist({ ownerId: owner, name: "A", sharedWith: [friend, friend] }).validate(), /en double/);
  await assert.rejects(new Playlist({ ownerId: owner, name: "A", sharedWith: [owner] }).validate(), /soi-même/);
});

test(
  "playlists : gestion, partage entre amis, perte d'accès et lecture (MONGODB_TEST_URI requis)",
  { skip: !process.env.MONGODB_TEST_URI },
  async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI);
    await Promise.all([Friendship.init(), Playlist.init()]);
    const suffix = Date.now();
    const users = {};
    const trackIds = [];

    try {
      for (const name of ["alice", "bruno", "chloe"]) {
        const response = await fetch(base + "/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email: `${name}.${suffix}@playlists.test`, password: "Password123" }),
        });
        const body = await response.json();
        users[name] = { ...body.user, token: body.token };
      }
      const call = (who, method, url, body) =>
        fetch(base + url, {
          method,
          headers: { Authorization: `Bearer ${users[who].token}`, "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
      const json = async (response) => ({ status: response.status, body: await response.json() });
      const upload = async (who, title) => {
        const form = new FormData();
        form.append("audio", new Blob([`audio ${title}`], { type: "audio/mpeg" }), `${title}.mp3`);
        form.append("title", title);
        const response = await fetch(base + "/api/tracks", {
          method: "POST",
          headers: { Authorization: `Bearer ${users[who].token}` },
          body: form,
        });
        const track = await response.json();
        trackIds.push(track.id);
        return track.id;
      };
      const [a1, a2] = [await upload("alice", "Intro"), await upload("alice", "Solo")];
      const chloeTrack = await upload("chloe", "Chloe song");

      // ---- Gestion personnelle ----
      assert.equal((await call("alice", "POST", "/api/playlists", { name: "  " })).status, 400);
      const created = await json(await call("alice", "POST", "/api/playlists", { name: "Mes favoris" }));
      assert.equal(created.status, 201);
      assert.deepEqual([created.body.name, created.body.trackCount, created.body.isOwner], ["Mes favoris", 0, true]);
      const id = created.body.id;

      assert.equal((await call("alice", "POST", `/api/playlists/${id}/tracks`, { trackId: a1 })).status, 201);
      assert.equal((await call("alice", "POST", `/api/playlists/${id}/tracks`, { trackId: a1 })).status, 409, "doublon");
      assert.equal((await call("alice", "POST", `/api/playlists/${id}/tracks`, { trackId: "abc" })).status, 400);
      assert.equal(
        (await call("alice", "POST", `/api/playlists/${id}/tracks`, { trackId: chloeTrack })).status,
        404,
        "musique d'un autre utilisateur",
      );
      await call("alice", "POST", `/api/playlists/${id}/tracks`, { trackId: a2 });
      const detail = await json(await call("alice", "GET", `/api/playlists/${id}`));
      assert.deepEqual(detail.body.tracks.map((track) => track.title), ["Intro", "Solo"], "ordre de trackIds");
      assert.equal(detail.body.tracks[0].audioUrl, `/api/playlists/${id}/tracks/${a1}/audio`);
      assert.deepEqual((await json(await call("alice", "GET", "/api/playlists"))).body.map((p) => p.id), [id]);

      // ---- Partage : réservé aux amis ----
      const share = (who, userIds) => call(who, "POST", `/api/playlists/${id}/shares`, { userIds });
      assert.equal((await share("alice", [users.bruno.id])).status, 400, "pas encore amis");
      assert.equal((await share("alice", [users.alice.id])).status, 400, "pas de partage avec soi-même");
      const request = await json(await call("alice", "POST", "/api/friendships", { email: users.bruno.email }));
      await call("bruno", "PATCH", `/api/friendships/${request.body.id}/accept`);

      const shared = await json(await share("alice", [users.bruno.id, users.bruno.id]));
      assert.deepEqual(shared.body.map((user) => user.name), ["bruno"]);
      await share("alice", [users.bruno.id]);
      assert.equal((await Playlist.findById(id)).sharedWith.length, 1, "pas de doublon dans sharedWith");
      assert.deepEqual((await json(await call("alice", "GET", `/api/playlists/${id}/shares`))).body.map((u) => u.name), ["bruno"]);

      // ---- Invité : consulter et écouter seulement ----
      const brunoShared = await json(await call("bruno", "GET", "/api/playlists/shared"));
      assert.deepEqual(brunoShared.body.map((p) => [p.name, p.owner.name, p.isOwner]), [["Mes favoris", "alice", false]]);
      assert.equal(brunoShared.body[0].sharedWithCount, undefined);
      assert.equal((await call("bruno", "GET", `/api/playlists/${id}`)).status, 200);
      const audio = await call("bruno", "GET", `/api/playlists/${id}/tracks/${a1}/audio`);
      assert.equal(audio.status, 200);
      assert.equal(await audio.text(), "audio Intro");
      assert.equal((await call("bruno", "GET", `/api/tracks/${a1}/audio`)).status, 404, "pas d'accès direct à la piste");
      assert.equal((await call("bruno", "GET", `/api/playlists/${id}/tracks/${chloeTrack}/audio`)).status, 404);
      for (const [method, url, body] of [
        ["PATCH", `/api/playlists/${id}`, { name: "Piraté" }],
        ["DELETE", `/api/playlists/${id}`],
        ["POST", `/api/playlists/${id}/tracks`, { trackId: a1 }],
        ["DELETE", `/api/playlists/${id}/tracks/${a1}`],
        ["GET", `/api/playlists/${id}/shares`],
        ["POST", `/api/playlists/${id}/shares`, { userIds: [users.bruno.id] }],
      ]) {
        assert.equal((await call("bruno", method, url, body)).status, 403, `invité : ${method} ${url}`);
      }
      // Une personne non invitée ne voit rien.
      assert.equal((await call("chloe", "GET", `/api/playlists/${id}`)).status, 404);
      assert.equal((await call("chloe", "GET", `/api/playlists/${id}/tracks/${a1}/audio`)).status, 404);
      assert.deepEqual((await json(await call("chloe", "GET", "/api/playlists/shared"))).body, []);

      // ---- Retrait d'une musique, renommage ----
      assert.equal((await call("alice", "DELETE", `/api/playlists/${id}/tracks/${a2}`)).status, 204);
      assert.equal((await call("alice", "DELETE", `/api/playlists/${id}/tracks/${a2}`)).status, 404);
      const renamed = await json(await call("alice", "PATCH", `/api/playlists/${id}`, { name: "Répétition" }));
      assert.deepEqual([renamed.status, renamed.body.name, renamed.body.trackCount], [200, "Répétition", 1]);

      // ---- Retrait d'un accès, puis fin de l'amitié ----
      assert.equal((await call("alice", "DELETE", `/api/playlists/${id}/shares/${users.bruno.id}`)).status, 204);
      assert.equal((await call("bruno", "GET", `/api/playlists/${id}`)).status, 404);
      await share("alice", [users.bruno.id]);
      // Il n'existe pas encore de route « retirer un ami » : la fin de l'amitié est simulée en base.
      await Friendship.updateOne(orderedPair(users.alice.id, users.bruno.id), { $set: { status: "REJECTED" } });
      assert.equal((await call("bruno", "GET", `/api/playlists/${id}`)).status, 404, "ancien ami : accès perdu");
      assert.equal((await call("bruno", "GET", `/api/playlists/${id}/tracks/${a1}/audio`)).status, 404);
      assert.deepEqual((await json(await call("bruno", "GET", "/api/playlists/shared"))).body, []);
      assert.deepEqual((await json(await call("alice", "GET", `/api/playlists/${id}/shares`))).body, []);
      assert.equal((await Playlist.findById(id)).sharedWith.length, 0, "ancien ami retiré de sharedWith");

      // ---- Suppression : les pistes restent ----
      assert.equal((await call("alice", "DELETE", `/api/playlists/${id}`)).status, 204);
      assert.equal(await Playlist.countDocuments({ _id: id }), 0);
      assert.equal(await Track.countDocuments({ _id: { $in: [a1, a2] } }), 2, "pistes conservées");
      assert.equal((await call("alice", "GET", `/api/tracks/${a1}/audio`)).status, 200, "fichier audio conservé");

      // ---- Suppression d'une piste : elle est retirée des playlists ----
      const other = await json(await call("alice", "POST", "/api/playlists", { name: "Autre" }));
      await call("alice", "POST", `/api/playlists/${other.body.id}/tracks`, { trackId: a2 });
      assert.equal((await call("alice", "DELETE", `/api/tracks/${a2}`)).status, 204);
      trackIds.splice(trackIds.indexOf(a2), 1);
      assert.deepEqual((await Playlist.findById(other.body.id)).trackIds, []);
    } finally {
      const ids = Object.values(users).map((user) => user.id);
      for (const who of Object.keys(users)) {
        for (const trackId of trackIds) {
          await fetch(`${base}/api/tracks/${trackId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${users[who].token}` },
          });
        }
      }
      await Playlist.deleteMany({ ownerId: { $in: ids } });
      await Friendship.deleteMany({ $or: [{ user1Id: { $in: ids } }, { user2Id: { $in: ids } }] });
      await User.deleteMany({ _id: { $in: ids } });
      await mongoose.disconnect();
    }
  },
);
