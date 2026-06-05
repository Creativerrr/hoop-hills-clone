import Data from "./Data.js";
import World from "./World.js";

const TYPE_LABEL = { RS: "Regular season", PI: "Play-In", PO: "Playoffs" };

export default class App {
  constructor() {
    this.canvas = document.getElementById("scene");
    this.statusEl = document.getElementById("status");
    this.teamEl = document.getElementById("team");
    this.opponentEl = document.getElementById("opponent");
    this.roundsEl = document.getElementById("rounds");
    this.periodsEl = document.getElementById("periods");
    this.tooltipEl = document.getElementById("tooltip");

    this.season = "2026";
    this.team = "ORL";
    this.allGames = [];
    this.filters = {
      opponent: "all",
      rounds: new Set(["RS", "PI", "PO"]),
      periods: new Set(["Q1", "Q2", "Q3", "Q4", "OT"]),
    };

    this.data = new Data(this);
    this.world = new World(this, this.canvas);

    this.init();
  }

  async init() {
    try {
      this.teams = await this.data.loadTeams("2024-25");
      this.populateTeams();
      this.bindRounds();
      this.bindPeriods();
      await this.loadTeam(this.team);
    } catch (err) {
      console.error(err);
      this.setStatus("error: " + err.message);
    }
  }

  populateTeams() {
    this.teamEl.innerHTML = "";
    for (const t of this.teams) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      this.teamEl.appendChild(opt);
    }
    this.teamEl.value = this.team;
    this.teamEl.addEventListener("change", () => this.loadTeam(this.teamEl.value));
    this.opponentEl.addEventListener("change", () => {
      this.filters.opponent = this.opponentEl.value;
      this.applyFilters();
    });
  }

  bindRounds() {
    this.roundsEl.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = btn.dataset.round;
        if (this.filters.rounds.has(r)) {
          this.filters.rounds.delete(r);
          btn.classList.remove("on");
        } else {
          this.filters.rounds.add(r);
          btn.classList.add("on");
        }
        this.applyFilters();
      });
    });
  }

  bindPeriods() {
    this.periodsEl.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.dataset.period;
        if (this.filters.periods.has(p)) {
          this.filters.periods.delete(p);
          btn.classList.remove("on");
        } else {
          this.filters.periods.add(p);
          btn.classList.add("on");
        }
        this.applyFilters();
      });
    });
  }

  teamName(id) {
    return this.teams.find((t) => t.id === id)?.name || id;
  }

  async loadTeam(team) {
    this.team = team;
    this.setStatus("loading…");
    this.allGames = await this.data.loadSeason(team, this.season);
    this.populateOpponents();
    this.filters.opponent = "all";
    this.opponentEl.value = "all";
    this.applyFilters();
    window.__ready = true;
  }

  populateOpponents() {
    this.opponentEl.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "All teams";
    this.opponentEl.appendChild(all);
    for (const opp of this.data.opponents) {
      const opt = document.createElement("option");
      opt.value = opp;
      opt.textContent = this.teamName(opp);
      this.opponentEl.appendChild(opt);
    }
  }

  applyFilters() {
    let games = this.allGames.filter((g) => this.filters.rounds.has(g.type));
    if (this.filters.opponent !== "all") {
      games = games.filter((g) => g.opponent === this.filters.opponent);
    }
    // re-order so depth packs tightly after filtering
    games = games.map((g, i) => ({ ...g, order: i }));
    this.world.setGames(games, { periods: this.filters.periods });
    this.tooltipEl.hidden = true; // clear any stale hover after a filter/team change
    const w = games.filter((g) => g.win).length;
    this.setStatus(`${games.length} games · ${w}–${games.length - w}`);
    this.renderStats(games, w);
  }

  renderStats(games, wins) {
    const set = (key, val) =>
      (document.querySelector(`[data-stat="${key}"]`).textContent = val);
    set("record", `${wins}–${games.length - wins}`);

    const winsGames = games.filter((g) => g.win);
    const lossGames = games.filter((g) => !g.win);

    const biggestWin = winsGames.reduce((a, g) => (g.finalDiff > (a?.finalDiff ?? -1e9) ? g : a), null);
    set("win", biggestWin ? `+${biggestWin.finalDiff} vs ${biggestWin.opponent}` : "–");

    // deepest hole climbed out of for a win
    const comeback = winsGames.reduce((a, g) => (g.maxTrail < (a?.maxTrail ?? 1e9) ? g : a), null);
    set("comeback", comeback && comeback.maxTrail < 0 ? `from ${comeback.maxTrail} vs ${comeback.opponent}` : "–");

    // biggest lead blown in a loss
    const collapse = lossGames.reduce((a, g) => (g.maxLead > (a?.maxLead ?? -1e9) ? g : a), null);
    set("collapse", collapse && collapse.maxLead > 0 ? `+${collapse.maxLead} vs ${collapse.opponent}` : "–");
  }

  onHover(game, client) {
    if (!game || !client) {
      this.tooltipEl.hidden = true;
      return;
    }
    const won = game.win;
    this.tooltipEl.querySelector(".tt-head").textContent =
      `${this.teamName(this.team)} vs ${this.teamName(game.opponent)}`;
    this.tooltipEl.querySelector(".tt-body").innerHTML =
      `${game.date} · ${TYPE_LABEL[game.type] || game.type}<br>` +
      `<span class="${won ? "win" : "loss"}">${won ? "W" : "L"} ${game.teamScore}–${game.oppScore}</span> · ` +
      `biggest lead +${game.maxLead}, trail ${game.maxTrail}`;
    this.tooltipEl.style.left = client.x + "px";
    this.tooltipEl.style.top = client.y + "px";
    this.tooltipEl.hidden = false;
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }
}
