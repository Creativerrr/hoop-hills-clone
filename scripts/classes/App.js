import Data from "./Data.js";
import World from "./World.js";

const TYPE_LABEL = { RS: "Regular season", PI: "Play-In", PO: "Playoffs" };

export default class App {
  constructor() {
    this.canvas = document.getElementById("scene");
    this.tooltipEl = document.getElementById("tooltip");

    this.season = "2026";
    this.team = "ORL";
    this.allGames = [];
    this.filters = {
      opponent: "all",
      results: new Set(["won", "lost"]),
      rounds: new Set(["RS", "PI", "PO"]),
      periods: new Set(["Q1", "Q2", "Q3", "Q4", "OT"]),
      sort: "margin",
      datePct: 100,
    };

    this.data = new Data(this);
    this.world = new World(this, this.canvas);
    this.init();
  }

  async init() {
    try {
      this.teams = await this.data.loadTeams("2024-25");
      this.populateTeams();
      this.populateSeasons();
      this.bindToggleGroup("games", "result", this.filters.results);
      this.bindToggleGroup("periods", "period", this.filters.periods);
      this.bindToggleGroup("rounds", "round", this.filters.rounds);
      this.bindSort();
      this.bindDateSlider();
      this.bindHideFilters();
      await this.loadTeam(this.team);
    } catch (err) {
      console.error(err);
    }
  }

  populateTeams() {
    const sel = document.getElementById("team");
    sel.innerHTML = "";
    for (const t of this.teams) {
      const o = document.createElement("option");
      o.value = t.id; o.textContent = t.name; sel.appendChild(o);
    }
    sel.value = this.team;
    sel.addEventListener("change", () => this.loadTeam(sel.value));
    document.getElementById("opponent").addEventListener("change", (e) => {
      this.filters.opponent = e.target.value; this.applyFilters();
    });
  }

  populateSeasons() {
    const sel = document.getElementById("season");
    sel.innerHTML = "";
    const seasons = [["2026", "2025-26"], ["2025", "2024-25"], ["2024", "2023-24"], ["2023", "2022-23"], ["2022", "2021-22"]];
    for (const [val, label] of seasons) {
      const o = document.createElement("option");
      o.value = val; o.textContent = label; sel.appendChild(o);
    }
    sel.value = this.season;
    sel.addEventListener("change", () => {
      this.season = sel.value;
      this.loadTeam(this.team);
    });
  }

  bindToggleGroup(id, attr, set) {
    document.getElementById(id).querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.dataset[attr];
        if (set.has(v)) { set.delete(v); btn.classList.remove("on"); }
        else { set.add(v); btn.classList.add("on"); }
        this.applyFilters();
      });
    });
  }

  bindSort() {
    document.getElementById("sortby").querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.filters.sort = btn.dataset.sort;
        document.querySelectorAll("#sortby button").forEach((b) => b.classList.toggle("on", b === btn));
        this.applyFilters();
      });
    });
  }

  bindDateSlider() {
    document.getElementById("date-slider").addEventListener("input", (e) => {
      this.filters.datePct = +e.target.value;
      const lbl = document.querySelector(".date-label");
      lbl.textContent = this.filters.datePct >= 100 ? "All dates" : `Up to ${this.cutoffDate()}`;
      this.applyFilters();
    });
  }

  bindHideFilters() {
    document.getElementById("toggle-filters").addEventListener("click", (e) => {
      const hidden = document.body.classList.toggle("filters-hidden");
      e.target.textContent = hidden ? "SHOW FILTERS" : "HIDE FILTERS";
    });
  }

  teamName(id) { return this.teams.find((t) => t.id === id)?.name || id; }

  async loadTeam(team) {
    this.team = team;
    this.allGames = await this.data.loadSeason(team, this.season);
    this.dates = this.allGames.map((g) => g.date).sort();
    this.populateOpponents();
    this.filters.opponent = "all";
    document.getElementById("opponent").value = "all";
    this.applyFilters();
    window.__ready = true;
  }

  populateOpponents() {
    const sel = document.getElementById("opponent");
    sel.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all"; all.textContent = "All other teams"; sel.appendChild(all);
    for (const opp of this.data.opponents) {
      const o = document.createElement("option");
      o.value = opp; o.textContent = this.teamName(opp); sel.appendChild(o);
    }
  }

  cutoffDate() {
    if (!this.dates?.length) return "";
    const i = Math.min(this.dates.length - 1, Math.floor((this.filters.datePct / 100) * (this.dates.length - 1)));
    return this.dates[i];
  }

  applyFilters() {
    const f = this.filters;
    const cutoff = f.datePct >= 100 ? "9999" : this.cutoffDate();
    let games = this.allGames.filter((g) =>
      f.rounds.has(g.type) &&
      (f.opponent === "all" || g.opponent === f.opponent) &&
      ((g.win && f.results.has("won")) || (!g.win && f.results.has("lost"))) &&
      g.date <= cutoff
    );

    if (f.sort === "margin") games.sort((a, b) => b.finalDiff - a.finalDiff);
    else games.sort((a, b) => a.date.localeCompare(b.date));

    games = games.map((g, i) => ({ ...g, order: i }));
    this.world.setGames(games, { periods: f.periods });
    this.tooltipEl.hidden = true;
    this.renderCount(games);
  }

  renderCount(games) {
    const won = games.filter((g) => g.win).length;
    const lost = games.length - won;
    document.getElementById("count-games").textContent = `${games.length} games`;
    document.getElementById("count-won").textContent = won;
    document.getElementById("count-lost").textContent = lost;
    const total = games.length || 1;
    document.getElementById("bar-won").style.flex = won / total;
    document.getElementById("bar-lost").style.flex = lost / total;
  }

  onHover(game, client) {
    if (!game || !client) { this.tooltipEl.hidden = true; return; }
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
}
