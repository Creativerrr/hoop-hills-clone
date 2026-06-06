import * as d3 from "d3";

// Loads a team-season CSV and groups the play-by-play rows into games.
export default class Data {
  constructor(app) {
    this.app = app;
    this.basePath = "data";
    this.teams = [];
    this.games = [];
  }

  async loadTeams(season = "2024-25") {
    const rows = await d3.csv(`${this.basePath}/teams-${season}.csv`);
    this.teams = rows.map((r) => ({ id: r.id, nick: r.nick, name: r.name, abbr: r.initials || r.id }));
    return this.teams;
  }

  parseDate(id) {
    // id like 202510220ORL -> 2025-10-22
    const y = id.slice(0, 4), m = id.slice(4, 6), d = id.slice(6, 8);
    return `${y}-${m}-${d}`;
  }

  async loadSeason(team = "ORL", season = "2026") {
    const file = `${this.basePath}/${team}-${season}.csv`;
    const rows = await d3.csv(file, (d) => ({
      id: d.id,
      type: d.type,
      opponent: d.opponent,
      t: +d.elapsedTime,
      event: d.event,
      ts: +d.teamScore,
      os: +d.opponentScore,
      pd: +d.pointDifference,
    }));

    const byId = new Map();
    for (const r of rows) {
      if (!byId.has(r.id)) {
        byId.set(r.id, { id: r.id, type: r.type, opponent: r.opponent, samples: [] });
      }
      byId.get(r.id).samples.push({ t: r.t, pd: r.pd, ts: r.ts, os: r.os });
    }

    const games = [...byId.values()].map((g, i) => {
      const last = g.samples[g.samples.length - 1];
      g.finalDiff = last ? last.pd : 0;
      g.teamScore = last ? last.ts : 0;
      g.oppScore = last ? last.os : 0;
      g.win = g.finalDiff > 0;
      g.date = this.parseDate(g.id);
      g.order = i;
      g.maxLead = d3.max(g.samples, (s) => s.pd) ?? 0;
      g.maxTrail = d3.min(g.samples, (s) => s.pd) ?? 0;
      return g;
    });

    this.games = games;
    this.opponents = [...new Set(games.map((g) => g.opponent))].sort();
    return games;
  }
}
