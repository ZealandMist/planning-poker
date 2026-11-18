function buildExpiredSessionDeletes(sessions, now = Date.now()) {
  const updates = {};

  Object.entries(sessions || {}).forEach(([sessionCode, session]) => {
    if (session && session.expiresAt && session.expiresAt <= now) {
      updates[`sessions/${sessionCode}`] = null;
    }
  });

  return updates;
}

module.exports = { buildExpiredSessionDeletes };
