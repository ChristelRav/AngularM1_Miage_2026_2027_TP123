import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { Friendship, orderedPair } from "../src/models/Friendship.js";
import { User } from "../src/models/User.js";

let server, base;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test("les routes d'amitié exigent une authentification", async () => {
  const id = "507f1f77bcf86cd799439011";
  const json = { "Content-Type": "application/json" };
  const calls = [
    fetch(base + "/api/friendships", { method: "POST", headers: json, body: JSON.stringify({ email: "a@b.c" }) }),
    fetch(base + "/api/friendships/received"),
    fetch(base + "/api/friendships/sent"),
    fetch(`${base}/api/friendships/${id}/accept`, { method: "PATCH" }),
    fetch(`${base}/api/friendships/${id}/reject`, { method: "PATCH" }),
    fetch(base + "/api/friends"),
  ];
  for (const response of await Promise.all(calls)) assert.equal(response.status, 401);
});

test("schéma Friendship : statuts, index unique et ordre normalisé du couple", async () => {
  assert.deepEqual(Friendship.schema.path("status").enumValues, ["PENDING", "ACCEPTED", "REJECTED"]);
  assert.equal(Friendship.schema.path("status").defaultValue, "PENDING");
  assert.ok(Friendship.schema.options.timestamps);
  const unique = Friendship.schema.indexes().find(([fields, options]) => options.unique);
  assert.deepEqual(unique[0], { user1Id: 1, user2Id: 1 });

  const a = new mongoose.Types.ObjectId("64b000000000000000000001");
  const b = new mongoose.Types.ObjectId("64b000000000000000000002");
  // « b demande a » et « a demande b » donnent le même couple ordonné.
  assert.deepEqual(orderedPair(b, a), orderedPair(a, b));
  const friendship = new Friendship({ user1Id: b, user2Id: a, requestedBy: b });
  await friendship.validate();
  assert.equal(String(friendship.user1Id), String(a));
  assert.equal(String(friendship.user2Id), String(b));
  assert.equal(String(friendship.requestedBy), String(b), "requestedBy n'est pas modifié par la normalisation");
  assert.equal(friendship.status, "PENDING");
});

test("schéma Friendship : refus d'une demande à soi-même ou d'un requestedBy extérieur", async () => {
  const a = new mongoose.Types.ObjectId();
  const b = new mongoose.Types.ObjectId();
  const self = new Friendship({ user1Id: a, user2Id: a, requestedBy: a });
  await assert.rejects(self.validate(), /s'envoyer une demande/);
  const outsider = new Friendship({ user1Id: a, user2Id: b, requestedBy: new mongoose.Types.ObjectId() });
  await assert.rejects(outsider.validate(), /requestedBy/);
  const badStatus = new Friendship({ user1Id: a, user2Id: b, requestedBy: a, status: "BLOCKED" });
  await assert.rejects(badStatus.validate(), /status/);
});

test(
  "demandes, notifications, acceptation, refus et liste d'amis (MONGODB_TEST_URI requis)",
  { skip: !process.env.MONGODB_TEST_URI },
  async () => {
    await mongoose.connect(process.env.MONGODB_TEST_URI);
    await Friendship.init();
    const suffix = Date.now();
    const users = {};
    const tokens = {};

    try {
      // Trois vrais comptes, créés par la route d'inscription existante.
      for (const name of ["alice", "bruno", "chloe"]) {
        const response = await fetch(base + "/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email: `${name}.${suffix}@friends.test`, password: "Password123" }),
        });
        assert.equal(response.status, 201);
        const body = await response.json();
        users[name] = body.user;
        tokens[name] = body.token;
      }
      const call = (who, method, url, body) =>
        fetch(base + url, {
          method,
          headers: { Authorization: `Bearer ${tokens[who]}`, "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
      const send = (from, to) => call(from, "POST", "/api/friendships", { email: users[to].email });

      // Validations de l'envoi.
      assert.equal((await call("alice", "POST", "/api/friendships", {})).status, 400);
      assert.equal((await call("alice", "POST", "/api/friendships", { userId: "abc" })).status, 400);
      assert.equal((await send("alice", "alice")).status, 400, "pas de demande à soi-même");
      const unknown = await call("alice", "POST", "/api/friendships", { email: `inconnu.${suffix}@friends.test` });
      assert.equal(unknown.status, 404);

      // Alice -> Bruno.
      const created = await send("alice", "bruno");
      assert.equal(created.status, 201);
      const request = await created.json();
      assert.deepEqual(
        { status: request.status, direction: request.direction, user: request.user },
        { status: "PENDING", direction: "SENT", user: { id: users.bruno.id, name: "bruno" } },
      );
      assert.equal(request.user.email, undefined, "l'email de l'autre utilisateur n'est pas exposé");

      // Doublons, dans les deux sens.
      assert.equal((await send("alice", "bruno")).status, 409);
      assert.equal((await send("bruno", "alice")).status, 409);
      const pair = orderedPair(users.alice.id, users.bruno.id);
      assert.equal(await Friendship.countDocuments(pair), 1);
      const stored = await Friendship.findOne(pair).lean();
      assert.ok(String(stored.user1Id) < String(stored.user2Id), "couple stocké dans l'ordre");
      assert.equal(String(stored.requestedBy), users.alice.id);

      // Demandes reçues / envoyées : chacun ne voit que les siennes.
      const received = await (await call("bruno", "GET", "/api/friendships/received")).json();
      assert.deepEqual(received.map((r) => [r.id, r.direction, r.user.name]), [[request.id, "RECEIVED", "alice"]]);
      assert.deepEqual(await (await call("alice", "GET", "/api/friendships/received")).json(), []);
      assert.deepEqual((await (await call("alice", "GET", "/api/friendships/sent")).json()).map((r) => r.id), [request.id]);
      assert.deepEqual(await (await call("chloe", "GET", "/api/friendships/received")).json(), []);

      // Permissions : l'expéditeur ne peut pas accepter, un tiers ne voit pas la demande.
      assert.equal((await call("alice", "PATCH", `/api/friendships/${request.id}/accept`)).status, 403);
      assert.equal((await call("chloe", "PATCH", `/api/friendships/${request.id}/accept`)).status, 404);
      assert.equal((await call("bruno", "PATCH", "/api/friendships/abc/accept")).status, 400);

      // Bruno accepte : plus de notification, les deux sont amis.
      const accepted = await call("bruno", "PATCH", `/api/friendships/${request.id}/accept`);
      assert.equal(accepted.status, 200);
      assert.equal((await accepted.json()).status, "ACCEPTED");
      assert.deepEqual(await (await call("bruno", "GET", "/api/friendships/received")).json(), []);
      assert.equal((await call("bruno", "PATCH", `/api/friendships/${request.id}/reject`)).status, 409);
      const aliceFriends = await (await call("alice", "GET", "/api/friends")).json();
      const brunoFriends = await (await call("bruno", "GET", "/api/friends")).json();
      assert.deepEqual(aliceFriends.map((f) => f.name), ["bruno"]);
      assert.deepEqual(brunoFriends.map((f) => f.name), ["alice"]);

      // Une demande acceptée ne peut pas être renvoyée, dans aucun sens.
      assert.equal((await send("alice", "bruno")).status, 409);
      assert.equal((await send("bruno", "alice")).status, 409);

      // Chloé -> Alice, refusée, puis renvoyée : toujours une seule relation.
      const second = await (await send("chloe", "alice")).json();
      const rejected = await call("alice", "PATCH", `/api/friendships/${second.id}/reject`);
      assert.equal(rejected.status, 200);
      assert.equal((await rejected.json()).status, "REJECTED");
      assert.deepEqual(await (await call("chloe", "GET", "/api/friends")).json(), []);
      const again = await send("chloe", "alice");
      assert.equal(again.status, 201);
      assert.equal((await again.json()).id, second.id, "la relation refusée est réutilisée");
      assert.equal(await Friendship.countDocuments(orderedPair(users.alice.id, users.chloe.id)), 1);
      assert.equal((await (await call("alice", "GET", "/api/friendships/received")).json()).length, 1);
    } finally {
      const ids = Object.values(users).map((user) => user.id);
      await Friendship.deleteMany({ $or: [{ user1Id: { $in: ids } }, { user2Id: { $in: ids } }] });
      await User.deleteMany({ _id: { $in: ids } });
      await mongoose.disconnect();
    }
  },
);
