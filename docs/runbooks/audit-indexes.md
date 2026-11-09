# Audit index migration

The audit listing orders by `{ <field>: ±1, _id: ±1 }` (the `_id` tie break keeps
pagination stable), and the filtered indexes were updated to carry the same key.
Mongoose `autoIndex` only creates declared indexes: it never drops an index that
disappeared from the schema. On a deployed collection that already has the old
indexes, run the drop step once or the collection keeps both sets and pays their
write cost.

## Superseded indexes

Drop these six once the new ones exist:

```js
db.auditevents.dropIndex('userId_1_createdAt_-1');
db.auditevents.dropIndex('targetUserId_1_createdAt_-1');
db.auditevents.dropIndex('applicationId_1_createdAt_-1');
db.auditevents.dropIndex('event_1_createdAt_-1');
db.auditevents.dropIndex('email_1_createdAt_-1');
db.auditevents.dropIndex('actorId_1_createdAt_-1');
```

The TTL index `{ createdAt: 1 }` stays: it enforces the retention policy.

## New indexes

Created automatically when `autoIndex` is enabled. On deployments where it is
disabled, create them manually:

```js
db.auditevents.createIndex({ userId: 1, createdAt: -1, _id: -1 });
db.auditevents.createIndex({ targetUserId: 1, createdAt: -1, _id: -1 });
db.auditevents.createIndex({ applicationId: 1, createdAt: -1, _id: -1 });
db.auditevents.createIndex({ event: 1, createdAt: -1, _id: -1 });
db.auditevents.createIndex({ email: 1, createdAt: -1, _id: -1 });
db.auditevents.createIndex({ actorId: 1, createdAt: -1, _id: -1 });
db.auditevents.createIndex({ createdAt: 1, _id: 1 });
```

## Verification

```js
db.auditevents.getIndexes().map((index) => index.name);
```

Every filtered index must end in `_id` and no old `{ field: 1, createdAt: -1 }`
index may remain. The case-insensitive `q` prefix search cannot use a b-tree
index by design and scans the collection.
