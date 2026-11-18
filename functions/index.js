const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { buildExpiredSessionDeletes } = require("./expiration");

initializeApp();

exports.removeExpiredSessions = onSchedule("every 15 minutes", async () => {
  const database = getDatabase();
  const snapshot = await database.ref("sessions").once("value");
  const updates = buildExpiredSessionDeletes(snapshot.val());

  if (Object.keys(updates).length > 0) {
    await database.ref().update(updates);
  }
});
