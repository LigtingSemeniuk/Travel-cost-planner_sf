const app = document.getElementById("app");

const state = {
  user: null,
  trips: [],
  editingTripId: null,
  adminUsers: [],
  adminTrips: [],
};

const routePicker = {
  map: null,
  markerA: null,
  markerB: null,
  line: null,
  a: null,
  b: null,
  clickMode: "A",
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    const msg =
      data?.error ||
      (Array.isArray(data?.errors) ? data.errors.join("\n") : null) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(v) {
  const n = Number(v || 0);
  return `${n.toFixed(2)} zł`;
}

function calcFallback(t) {
  const distance = Number(t.distance_km || 0);
  const consumption = Number(t.fuel_consumption_per_100 || 0);
  const fuelPrice = Number(t.fuel_price || 0);
  const routeCost = Number(t.route_cost || 0);
  const lodgingCost = Number(t.lodging_cost || 0);
  const foodCost = Number(t.food_cost || 0);
  const otherCost = Number(t.other_cost || 0);
  const people = Math.max(1, Number(t.people_count || 1));

  const liters = (distance / 100) * consumption;
  const fuelCost = liters * fuelPrice;
  const extrasCost = routeCost + lodgingCost + foodCost + otherCost;
  const totalCost = fuelCost + extrasCost;
  const costPerPerson = totalCost / people;

  return {
    liters: Number(liters.toFixed(2)),
    fuelCost: Number(fuelCost.toFixed(2)),
    extrasCost: Number(extrasCost.toFixed(2)),
    totalCost: Number(totalCost.toFixed(2)),
    costPerPerson: Number(costPerPerson.toFixed(2)),
    breakdown: {
      fuel: Number(fuelCost.toFixed(2)),
      route: Number(routeCost.toFixed(2)),
      lodging: Number(lodgingCost.toFixed(2)),
      food: Number(foodCost.toFixed(2)),
      other: Number(otherCost.toFixed(2)),
    },
  };
}

function tripCalc(t) {
  return t.calc || calcFallback(t);
}

function formatTripDates(trip) {
  if (trip.start_date && trip.end_date) return `${esc(trip.start_date)} — ${esc(trip.end_date)}`;
  if (trip.start_date) return esc(trip.start_date);
  if (trip.end_date) return esc(trip.end_date);
  return "-";
}

function countTripsThisMonth() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  return state.trips.filter((trip) => {
    if (!trip.start_date) return false;
    const d = new Date(trip.start_date);
    if (Number.isNaN(d.getTime())) return false;
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;
}

function layout(content, activePage = "dashboard") {
  const loggedIn = Boolean(state.user);

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-icon" aria-hidden="true">✦</div>
          <div>
            <h1>Travel Cost Planner</h1>
            <p>${loggedIn ? "Plan routes and calculate travel expenses" : "Plan smarter trips and split costs easily"}</p>
          </div>
        </div>

        ${
          loggedIn
            ? `
              <nav class="main-nav" aria-label="Main navigation">
                <button class="nav-link ${activePage === "dashboard" ? "is-active" : ""}" id="nav-dashboard" type="button">Dashboard</button>
                <button class="nav-link ${activePage === "trips" ? "is-active" : ""}" id="nav-my-trips" type="button">My Trips</button>
                <button class="nav-link" id="nav-new-trip" type="button">New Trip</button>
                <button class="nav-link" id="nav-about" type="button">About</button>
              </nav>
            `
            : ""
        }

        <div id="top-actions" class="top-actions"></div>
      </header>

      <main class="page-container">
        ${content}
      </main>
    </div>
  `;

  renderTopActions();
  bindMainNavigation();
}

function bindMainNavigation() {
  document.getElementById("nav-dashboard")?.addEventListener("click", async () => {
    state.editingTripId = null;
    await loadTrips();
    renderTripsScreen("dashboard");
  });

  document.getElementById("nav-my-trips")?.addEventListener("click", async () => {
    state.editingTripId = null;
    await loadTrips();
    renderTripsScreen("trips");
  });

  document.getElementById("nav-new-trip")?.addEventListener("click", () => {
    state.editingTripId = null;
    renderTripsScreen("dashboard");
    setTimeout(() => document.querySelector('input[name="title"]')?.focus(), 100);
  });

  document.getElementById("nav-about")?.addEventListener("click", () => {
    alert("Travel Cost Planner helps you calculate fuel, route, lodging, food and other trip costs.");
  });
}

function renderTopActions() {
  const el = document.getElementById("top-actions");
  if (!el) return;

  if (!state.user) {
    el.innerHTML = "";
    return;
  }

  const isAdmin = (state.user.roles || []).includes("ROLE_ADMIN");

  el.innerHTML = `
    <div class="user-actions">
      <span class="user-email" title="${esc(state.user.email)}">${esc(state.user.email)}</span>
      <button class="btn btn-light" id="btn-my-trips" type="button">My trips</button>
      ${isAdmin ? `<button class="btn btn-light" id="btn-admin-panel" type="button">Admin panel</button>` : ""}
      <button class="btn btn-light btn-icon-right" id="btn-logout" type="button">Logout <span aria-hidden="true">↗</span></button>
    </div>
  `;

  document.getElementById("btn-my-trips")?.addEventListener("click", async () => {
    state.editingTripId = null;
    await loadTrips();
    renderTripsScreen("trips");
  });

  document.getElementById("btn-admin-panel")?.addEventListener("click", async () => {
    await loadAdminData();
    renderAdminScreen();
  });

  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    try {
      await api("/api/logout", { method: "POST", body: "{}" });
    } catch (_) {}
    state.user = null;
    state.trips = [];
    renderAuthScreen("login");
  });
}

function showMsg(id, text, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<div class="message ${isError ? "message-error" : "message-success"}">${esc(text)}</div>`;
}

async function loadMe() {
  try {
    const data = await api("/api/me");
    state.user = data.user;
    return true;
  } catch (_) {
    state.user = null;
    return false;
  }
}

async function loadTrips() {
  const data = await api("/api/trips");
  state.trips = data.items || [];
}

function emptyTrip() {
  return {
    title: "",
    distance_km: 0,
    fuel_price: 0,
    fuel_consumption_per_100: 0,
    people_count: 1,
    route_cost: 0,
    lodging_cost: 0,
    food_cost: 0,
    other_cost: 0,
    start_date: "",
    end_date: "",
    expenses: [],
  };
}

function getEditingTrip() {
  if (!state.editingTripId) return null;
  return state.trips.find((t) => t.id === state.editingTripId) || null;
}

function ensureMapInit() {
  const el = document.getElementById("route-map");
  if (!el || typeof L === "undefined") return;

  if (routePicker.map && routePicker.map._container !== el) {
    routePicker.map.remove();
    routePicker.map = null;
    routePicker.markerA = null;
    routePicker.markerB = null;
    routePicker.line = null;
  }

  if (!routePicker.map) {
    routePicker.map = L.map("route-map").setView([52.4064, 16.9252], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(routePicker.map);

    routePicker.map.on("click", (e) => {
      setRoutePoint(routePicker.clickMode, e.latlng.lat, e.latlng.lng, true);
      routePicker.clickMode = routePicker.clickMode === "A" ? "B" : "A";
      updateRouteModeButtons();
    });
  }

  setTimeout(() => routePicker.map.invalidateSize(), 50);
}

function resetRouteMapState() {
  routePicker.a = null;
  routePicker.b = null;
  routePicker.clickMode = "A";

  if (routePicker.line && routePicker.map) {
    routePicker.map.removeLayer(routePicker.line);
    routePicker.line = null;
  }
  if (routePicker.markerA && routePicker.map) {
    routePicker.map.removeLayer(routePicker.markerA);
    routePicker.markerA = null;
  }
  if (routePicker.markerB && routePicker.map) {
    routePicker.map.removeLayer(routePicker.markerB);
    routePicker.markerB = null;
  }
}

function updateRouteModeButtons() {
  const btnA = document.getElementById("btn-mode-a");
  const btnB = document.getElementById("btn-mode-b");

  btnA?.classList.toggle("is-active", routePicker.clickMode === "A");
  btnB?.classList.toggle("is-active", routePicker.clickMode === "B");
}

function setRoutePoint(which, lat, lng, updateInputs = false, label = "") {
  if (!routePicker.map || typeof L === "undefined") return;

  const point = {
    lat: Number(lat),
    lng: Number(lng),
    label: label || `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`,
  };

  if (which === "A") {
    routePicker.a = point;
    if (routePicker.markerA) {
      routePicker.markerA.setLatLng([point.lat, point.lng]);
    } else {
      routePicker.markerA = L.marker([point.lat, point.lng]).addTo(routePicker.map);
    }
    routePicker.markerA.bindPopup("Point A");
    if (updateInputs) {
      const aLat = document.getElementById("route-a-lat");
      const aLng = document.getElementById("route-a-lng");
      if (aLat) aLat.value = point.lat.toFixed(6);
      if (aLng) aLng.value = point.lng.toFixed(6);
    }
  } else {
    routePicker.b = point;
    if (routePicker.markerB) {
      routePicker.markerB.setLatLng([point.lat, point.lng]);
    } else {
      routePicker.markerB = L.marker([point.lat, point.lng]).addTo(routePicker.map);
    }
    routePicker.markerB.bindPopup("Point B");
    if (updateInputs) {
      const bLat = document.getElementById("route-b-lat");
      const bLng = document.getElementById("route-b-lng");
      if (bLat) bLat.value = point.lat.toFixed(6);
      if (bLng) bLng.value = point.lng.toFixed(6);
    }
  }
}

async function geocodeAddress(which) {
  const inputId = which === "A" ? "route-a-address" : "route-b-address";
  const q = (document.getElementById(inputId)?.value || "").trim();
  if (!q) return alert("Впиши адресу");

  try {
    const data = await api(`/api/geocode?q=${encodeURIComponent(q)}`, { method: "GET" });
    const first = data.items?.[0];
    if (!first) return alert("Адресу не знайдено");

    setRoutePoint(which, first.lat, first.lng, true, first.display_name);
    routePicker.map?.setView([first.lat, first.lng], 13);
  } catch (err) {
    alert(err.message);
  }
}

async function buildRouteAndFillDistance() {
  if (!routePicker.a || !routePicker.b) {
    return alert("Вибери пункт A і пункт B на мапі або через адреси");
  }

  if (
    !Number.isFinite(Number(routePicker.a.lat)) ||
    !Number.isFinite(Number(routePicker.a.lng)) ||
    !Number.isFinite(Number(routePicker.b.lat)) ||
    !Number.isFinite(Number(routePicker.b.lng))
  ) {
    return alert("Некоректні координати A/B");
  }

  try {
    const data = await api("/api/route", {
      method: "POST",
      body: JSON.stringify({
        from: { lat: Number(routePicker.a.lat), lng: Number(routePicker.a.lng) },
        to: { lat: Number(routePicker.b.lat), lng: Number(routePicker.b.lng) },
      }),
    });

    if (routePicker.line && routePicker.map) {
      routePicker.map.removeLayer(routePicker.line);
    }

    if (Array.isArray(data.geometry) && data.geometry.length && routePicker.map) {
      routePicker.line = L.polyline(data.geometry).addTo(routePicker.map);
      routePicker.map.fitBounds(routePicker.line.getBounds(), { padding: [20, 20] });
    }

    const distanceInput = document.querySelector('input[name="distance_km"]');
    if (distanceInput) distanceInput.value = Number(data.distance_km || 0);

    const routeInfo = document.getElementById("route-info");
    if (routeInfo) {
      routeInfo.innerHTML = `Route distance: <strong>${Number(data.distance_km).toFixed(2)} km</strong> · Estimated time: <strong>${Number(data.duration_min).toFixed(1)} min</strong>`;
    }
  } catch (err) {
    alert(err.message || "Помилка побудови маршруту");
  }
}

function renderAuthScreen(activeTab = "login") {
  layout(`
    <section class="auth-page">
      <div class="auth-hero">
        <span class="eyebrow">Travel planning</span>
        <h2>Calculate your trip costs in one clean dashboard.</h2>
        <p>Save routes, estimate fuel and split expenses between passengers.</p>
      </div>

      <div class="auth-card card">
        <h2>Welcome</h2>
        <p class="card-subtitle">${activeTab === "login" ? "Log in to continue planning your trips." : "Create an account and start planning."}</p>

        <div class="auth-tabs">
          <button id="tab-login" type="button" class="tab-btn ${activeTab === "login" ? "is-active" : ""}">Login</button>
          <button id="tab-register" type="button" class="tab-btn ${activeTab === "register" ? "is-active" : ""}">Register</button>
        </div>

        ${
          activeTab === "login"
            ? `
          <form id="login-form" class="form-stack">
            <label class="field">
              <span>Email</span>
              <input type="email" name="email" required placeholder="you@example.com">
            </label>
            <label class="field">
              <span>Password</span>
              <input type="password" name="password" required placeholder="Your password">
            </label>
            <button type="submit" class="btn btn-primary btn-full">Login</button>
          </form>
          <p class="auth-switch">No account? <a href="#" id="switch-to-register">Create one</a></p>
        `
            : `
          <form id="register-form" class="form-stack">
            <label class="field">
              <span>Email</span>
              <input type="email" name="email" required placeholder="you@example.com">
            </label>
            <label class="field">
              <span>Password</span>
              <input type="password" name="password" required minlength="6" placeholder="Minimum 6 characters">
            </label>
            <button type="submit" class="btn btn-primary btn-full">Register</button>
          </form>
          <p class="auth-switch">Already have an account? <a href="#" id="switch-to-login">Login</a></p>
        `
        }

        <div id="auth-msg" class="message-area"></div>
      </div>
    </section>
  `);

  document.getElementById("tab-login")?.addEventListener("click", () => renderAuthScreen("login"));
  document.getElementById("tab-register")?.addEventListener("click", () => renderAuthScreen("register"));

  document.getElementById("switch-to-register")?.addEventListener("click", (e) => {
    e.preventDefault();
    renderAuthScreen("register");
  });

  document.getElementById("switch-to-login")?.addEventListener("click", (e) => {
    e.preventDefault();
    renderAuthScreen("login");
  });

  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      state.user = data.user;
      await loadTrips();
      renderTripsScreen();
    } catch (err) {
      showMsg("auth-msg", err.message, true);
    }
  });

  document.getElementById("register-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/register", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      showMsg("auth-msg", "Registered successfully. Now log in.");
      setTimeout(() => renderAuthScreen("login"), 700);
    } catch (err) {
      showMsg("auth-msg", err.message, true);
    }
  });
}

function renderTripsScreen(activePage = "dashboard") {
  const editing = getEditingTrip();
  const t = editing || emptyTrip();

  resetRouteMapState();

  const rows = state.trips
    .map((trip) => {
      const c = tripCalc(trip);
      return `
      <tr>
        <td>
          <div class="table-title">${esc(trip.title)}</div>
          <div class="table-muted">${Number(trip.distance_km || 0).toFixed(2)} km</div>
        </td>
        <td>${formatTripDates(trip)}</td>
        <td>${money(c.costPerPerson)}</td>
        <td>${money(c.totalCost)}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-small btn-light" data-edit-trip="${trip.id}" type="button">Edit</button>
            <button class="btn btn-small btn-danger" data-del-trip="${trip.id}" type="button">Delete</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  const totalAll = state.trips.reduce((sum, trip) => sum + Number(tripCalc(trip).totalCost || 0), 0);
  const totalFuel = state.trips.reduce((sum, trip) => sum + Number(tripCalc(trip).breakdown?.fuel || 0), 0);
  const totalExtras = state.trips.reduce((sum, trip) => sum + Number(tripCalc(trip).extrasCost || 0), 0);
  const tripsThisMonth = countTripsThisMonth();

  layout(`
    <section class="dashboard-grid">
      <aside class="card trip-form-card">
        <div class="section-heading with-accent">
          <div>
            <h2>${editing ? "Edit trip" : "Create a new trip"}</h2>
            <p>Plan your route and estimate the cost of your trip</p>
          </div>
        </div>

        <form id="trip-form" class="trip-form">
          <label class="field field-full">
            <span>Title</span>
            <input name="title" required maxlength="255" value="${esc(t.title || "")}" placeholder="e.g. Weekend in the mountains">
          </label>

          <div class="route-card">
            <div class="route-card-header">
              <div>
                <h3>Route map (A → B)</h3>
                <p>Find addresses or choose points directly on the map</p>
              </div>
            </div>

            <label class="field route-field">
              <span>Address A</span>
              <div class="input-action">
                <input id="route-a-address" type="text" placeholder="Start address">
                <button type="button" id="btn-geocode-a" class="btn btn-primary btn-compact">Find A</button>
              </div>
            </label>

            <label class="field route-field">
              <span>Address B</span>
              <div class="input-action">
                <input id="route-b-address" type="text" placeholder="Destination address">
                <button type="button" id="btn-geocode-b" class="btn btn-primary btn-compact">Find B</button>
              </div>
            </label>

            <div class="hidden-fields" aria-hidden="true">
              <input id="route-a-lat" type="text">
              <input id="route-a-lng" type="text">
              <input id="route-b-lat" type="text">
              <input id="route-b-lng" type="text">
            </div>

            <div class="route-actions">
              <button type="button" id="btn-mode-a" class="btn btn-outline is-active">Click map: A</button>
              <button type="button" id="btn-mode-b" class="btn btn-outline">Click map: B</button>
              <button type="button" id="btn-build-route" class="btn btn-light">Build route</button>
            </div>

            <div id="route-map" class="route-map"></div>
            <div id="route-info" class="route-info"></div>
          </div>

          <div class="cost-grid">
            <label class="field cost-field">
              <span class="field-icon">⌁</span>
              <span>Distance (km)</span>
              <input name="distance_km" type="number" min="0" step="0.01" value="${Number(t.distance_km || 0)}">
            </label>

            <label class="field cost-field">
              <span class="field-icon">⛽</span>
              <span>Fuel price (zł/L)</span>
              <input name="fuel_price" type="number" min="0" step="0.01" value="${Number(t.fuel_price || 0)}">
            </label>

            <label class="field cost-field">
              <span class="field-icon">💧</span>
              <span>Fuel consumption (L/100km)</span>
              <input name="fuel_consumption_per_100" type="number" min="0" step="0.01" value="${Number(t.fuel_consumption_per_100 || 0)}">
            </label>

            <label class="field cost-field">
              <span class="field-icon">👥</span>
              <span>People count</span>
              <input name="people_count" type="number" min="1" step="1" value="${Number(t.people_count || 1)}">
            </label>

            <label class="field cost-field">
              <span class="field-icon">🛣</span>
              <span>Route cost (zł)</span>
              <input name="route_cost" type="number" min="0" step="0.01" value="${Number(t.route_cost || 0)}">
            </label>

            <label class="field cost-field">
              <span class="field-icon">🛏</span>
              <span>Lodging cost (zł)</span>
              <input name="lodging_cost" type="number" min="0" step="0.01" value="${Number(t.lodging_cost || 0)}">
            </label>

            <label class="field cost-field">
              <span class="field-icon">🍽</span>
              <span>Food cost (zł)</span>
              <input name="food_cost" type="number" min="0" step="0.01" value="${Number(t.food_cost || 0)}">
            </label>

            <label class="field cost-field">
              <span class="field-icon">•••</span>
              <span>Other cost (zł)</span>
              <input name="other_cost" type="number" min="0" step="0.01" value="${Number(t.other_cost || 0)}">
            </label>
          </div>

          <div class="date-grid">
            <label class="field">
              <span>Start date</span>
              <input name="start_date" type="date" value="${esc(t.start_date || "")}">
            </label>

            <label class="field">
              <span>End date</span>
              <input name="end_date" type="date" value="${esc(t.end_date || "")}">
            </label>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary btn-full">${editing ? "Update trip" : "Create trip"}</button>
            ${editing ? `<button type="button" id="cancel-edit" class="btn btn-light btn-full">Cancel</button>` : ""}
          </div>
        </form>

        <div id="trip-form-msg" class="message-area"></div>
      </aside>

      <section class="dashboard-content">
        <div class="stats-grid">
          <div class="stat-card card">
            <div class="stat-icon purple">▣</div>
            <div>
              <strong>${state.trips.length}</strong>
              <span>Total trips</span>
            </div>
          </div>

          <div class="stat-card card">
            <div class="stat-icon green">♢</div>
            <div>
              <strong>${money(totalFuel)}</strong>
              <span>Total fuel</span>
            </div>
          </div>

          <div class="stat-card card">
            <div class="stat-icon orange">▰</div>
            <div>
              <strong>${money(totalAll)}</strong>
              <span>Total all</span>
            </div>
          </div>

          <div class="stat-card card">
            <div class="stat-icon blue">●</div>
            <div>
              <strong>${tripsThisMonth}</strong>
              <span>Trips this month</span>
            </div>
          </div>
        </div>

        <div class="card trips-table-card">
          <div class="table-card-header">
            <div class="section-title-row">
              <div class="section-icon">▤</div>
              <div>
                <h2>My trips</h2>
                <p>Manage saved routes and cost calculations</p>
              </div>
            </div>
          </div>

          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Dates</th>
                  <th>Per person</th>
                  <th>Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>${rows || `<tr><td colspan="5" class="empty-row">No trips yet.</td></tr>`}</tbody>
            </table>
          </div>

          <div class="table-footer">Extras total (all trips): <strong>${money(totalExtras)}</strong></div>
        </div>

        ${
          state.trips.length === 0
            ? `
              <div class="card empty-state">
                <div class="empty-illustration" aria-hidden="true">
                  <div class="empty-suitcase">▣</div>
                  <div class="empty-sign">↗</div>
                </div>
                <h2>No trips planned yet</h2>
                <p>Create your first trip and start planning your adventure.</p>
                <button class="btn btn-primary" id="empty-create-trip" type="button">＋ Create your first trip</button>
              </div>
            `
            : `
              <div class="card summary-card">
                <div class="section-title-row">
                  <div class="section-icon">✓</div>
                  <div>
                    <h2>Cost summary</h2>
                    <p>Your current saved trip overview</p>
                  </div>
                </div>
                <div class="summary-grid">
                  <div><span>Fuel</span><strong>${money(totalFuel)}</strong></div>
                  <div><span>Extras</span><strong>${money(totalExtras)}</strong></div>
                  <div><span>Total</span><strong>${money(totalAll)}</strong></div>
                </div>
              </div>
            `
        }
      </section>
    </section>
  `, activePage);

  document.getElementById("trip-form")?.addEventListener("submit", onTripSubmit);
  document.getElementById("cancel-edit")?.addEventListener("click", () => {
    state.editingTripId = null;
    renderTripsScreen(activePage);
  });

  document.getElementById("empty-create-trip")?.addEventListener("click", () => {
    document.querySelector('input[name="title"]')?.focus();
  });

  app.querySelectorAll("[data-edit-trip]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.editingTripId = Number(btn.getAttribute("data-edit-trip"));
      renderTripsScreen(activePage);
    });
  });

  app.querySelectorAll("[data-del-trip]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-del-trip"));
      if (!confirm("Delete this trip?")) return;
      try {
        await api(`/api/trip/${id}`, { method: "DELETE" });
        state.editingTripId = null;
        await loadTrips();
        renderTripsScreen(activePage);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  ensureMapInit();
  updateRouteModeButtons();

  document.getElementById("btn-geocode-a")?.addEventListener("click", () => geocodeAddress("A"));
  document.getElementById("btn-geocode-b")?.addEventListener("click", () => geocodeAddress("B"));
  document.getElementById("btn-build-route")?.addEventListener("click", buildRouteAndFillDistance);

  document.getElementById("btn-mode-a")?.addEventListener("click", () => {
    routePicker.clickMode = "A";
    updateRouteModeButtons();
  });
  document.getElementById("btn-mode-b")?.addEventListener("click", () => {
    routePicker.clickMode = "B";
    updateRouteModeButtons();
  });
}

async function onTripSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);

  const payload = {
    title: String(fd.get("title") || "").trim(),
    distance_km: Number(fd.get("distance_km") || 0),
    fuel_price: Number(fd.get("fuel_price") || 0),
    fuel_consumption_per_100: Number(fd.get("fuel_consumption_per_100") || 0),
    people_count: Number(fd.get("people_count") || 1),
    route_cost: Number(fd.get("route_cost") || 0),
    lodging_cost: Number(fd.get("lodging_cost") || 0),
    food_cost: Number(fd.get("food_cost") || 0),
    other_cost: Number(fd.get("other_cost") || 0),
    start_date: fd.get("start_date") || null,
    end_date: fd.get("end_date") || null,
    expenses: [],
  };

  try {
    if (state.editingTripId) {
      await api(`/api/trip/${state.editingTripId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showMsg("trip-form-msg", "Trip updated.");
    } else {
      await api("/api/trips", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      showMsg("trip-form-msg", "Trip created.");
    }

    state.editingTripId = null;
    await loadTrips();
    renderTripsScreen();
  } catch (err) {
    showMsg("trip-form-msg", err.message, true);
  }
}

async function loadAdminData() {
  const [users, trips] = await Promise.all([api("/api/admin/users"), api("/api/admin/trips")]);
  state.adminUsers = users.items || [];
  state.adminTrips = trips.items || [];
}

function renderAdminScreen() {
  const usersRows = state.adminUsers
    .map(
      (u) => `
    <tr>
      <td>${u.id}</td>
      <td>${esc(u.email)}</td>
      <td><span class="role-badge">${esc((u.roles || []).join(", "))}</span></td>
      <td>
        <div class="table-actions">
          <button class="btn btn-small btn-light" data-role-user="${u.id}" type="button">ROLE_USER</button>
          <button class="btn btn-small btn-primary" data-role-admin="${u.id}" type="button">ROLE_ADMIN</button>
          <button class="btn btn-small btn-danger" data-del-user="${u.id}" type="button">Delete</button>
        </div>
      </td>
    </tr>`
    )
    .join("");

  const tripsRows = state.adminTrips
    .map((t) => {
      const c = t.calc || {};
      return `
      <tr>
        <td>${t.id}</td>
        <td>${esc(t.user_email || "")}</td>
        <td>${esc(t.title || "")}</td>
        <td>${money(c.totalCost || 0)}</td>
        <td><button class="btn btn-small btn-danger" data-del-admin-trip="${t.id}" type="button">Delete</button></td>
      </tr>`;
    })
    .join("");

  layout(`
    <section class="admin-page">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Admin dashboard</span>
          <h2>System management</h2>
          <p>Manage users, roles and saved trips.</p>
        </div>
      </div>

      <div class="card admin-card">
        <div class="section-title-row">
          <div class="section-icon">👤</div>
          <div>
            <h2>Admin: users</h2>
            <p>Change user roles or remove accounts</p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${usersRows || `<tr><td colspan="4" class="empty-row">No users.</td></tr>`}</tbody>
          </table>
        </div>
      </div>

      <div class="card admin-card">
        <div class="section-title-row">
          <div class="section-icon">🧳</div>
          <div>
            <h2>Admin: trips</h2>
            <p>Review and delete user trips</p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Title</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${tripsRows || `<tr><td colspan="5" class="empty-row">No trips.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </section>
  `, "admin");

  app.querySelectorAll("[data-role-user]").forEach((btn) => {
    btn.addEventListener("click", () => changeUserRole(Number(btn.dataset.roleUser), "ROLE_USER"));
  });
  app.querySelectorAll("[data-role-admin]").forEach((btn) => {
    btn.addEventListener("click", () => changeUserRole(Number(btn.dataset.roleAdmin), "ROLE_ADMIN"));
  });
  app.querySelectorAll("[data-del-user]").forEach((btn) => {
    btn.addEventListener("click", () => deleteUserAdmin(Number(btn.dataset.delUser)));
  });
  app.querySelectorAll("[data-del-admin-trip]").forEach((btn) => {
    btn.addEventListener("click", () => deleteTripAdmin(Number(btn.dataset.delAdminTrip)));
  });
}

async function changeUserRole(id, role) {
  if (!confirm(`Set ${role} for user #${id}?`)) return;
  try {
    await api(`/api/admin/users/${id}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    });
    await loadAdminData();
    renderAdminScreen();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteUserAdmin(id) {
  if (!confirm(`Delete user #${id}?`)) return;
  try {
    await api(`/api/admin/users/${id}`, { method: "DELETE" });
    await loadAdminData();
    renderAdminScreen();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteTripAdmin(id) {
  if (!confirm(`Delete trip #${id}?`)) return;
  try {
    await api(`/api/admin/trips/${id}`, { method: "DELETE" });
    await loadAdminData();
    renderAdminScreen();
  } catch (err) {
    alert(err.message);
  }
}

async function boot() {
  const ok = await loadMe();
  if (!ok) {
    renderAuthScreen("login");
    return;
  }
  await loadTrips();
  renderTripsScreen();
}

boot();