// Live entry counts per fund, holder, party and category (Settings shows them next to each record).
const registerEntryCountRoutes = (app, { repo }) => {
  app.get('/api/books/:b/entry-counts', async c => c.json(await repo.entryCounts.get(c.req.param('b'))));
};

module.exports = { registerEntryCountRoutes };
