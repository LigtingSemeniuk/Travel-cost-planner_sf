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

function layout(content) {
  app.innerHTML = `
    <div class="container" style="max-width:1100px;margin:20px auto;padding:0 16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        <h1 style="margin:0;">Travel Cost Planner</h1>
        <div id="top-actions"></div>
      </div>
      ${content}
    </div>
  `;
  renderTopActions();
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
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <span>${esc(state.user.email)}</span>
      <button id="btn-my-trips">My trips</button>
      ${isAdmin ? `<button id="btn-admin-panel">Admin panel</button>` : ""}
      <button id="btn-logout">Logout</button>
    </div>
  `;

  document.getElementById("btn-my-trips")?.addEventListener("click", async () => {
    state.editingTripId = null;
    await loadTrips();
    renderTripsScreen();
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
  el.innerHTML = `<div style="padding:10px;border-radius:8px;border:1px solid ${isError ? "#cc6666" : "#66aa66"};background:${isError ? "#ffeaea" : "#ecfff0"};">${esc(text)}</div>`;
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

  if (!routePicker.map) {
    routePicker.map = L.map("route-map").setView([52.4064, 16.9252], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(routePicker.map);

    routePicker.map.on("click", (e) => {
      setRoutePoint(routePicker.clickMode, e.latlng.lat, e.latlng.lng, true);
      routePicker.clickMode = routePicker.clickMode === "A" ? "B" : "A";
    });
  }

  setTimeout(() => routePicker.map.invalidateSize(), 50);
}

function resetRouteMapState() {
  routePicker.a = null;
  routePicker.b = null;

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
      routeInfo.innerHTML = `Маршрут: <strong>${Number(data.distance_km).toFixed(2)} km</strong>, час: <strong>${Number(data.duration_min).toFixed(1)} хв</strong>`;
    }
  } catch (err) {
    alert(err.message || "Помилка побудови маршруту");
  }
}

function renderAuthScreen(activeTab = "login") {
  layout(`
    <div style="max-width:520px;margin:0 auto;">
      <div style="border:1px solid #ddd;border-radius:12px;padding:16px;background:#fff;">
        <h2 style="margin-top:0;margin-bottom:14px;">Welcome</h2>

        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <button id="tab-login" type="button" style="flex:1;${
            activeTab === "login" ? "background:#2563eb;color:#fff;border-color:#2563eb;" : ""
          }">
            Login
          </button>
          <button id="tab-register" type="button" style="flex:1;${
            activeTab === "register" ? "background:#2563eb;color:#fff;border-color:#2563eb;" : ""
          }">
            Register
          </button>
        </div>

        ${
          activeTab === "login"
            ? `
          <form id="login-form">
            <div style="margin-bottom:10px;">
              <label>Email</label><br>
              <input type="email" name="email" required style="width:100%;padding:8px;">
            </div>
            <div style="margin-bottom:10px;">
              <label>Password</label><br>
              <input type="password" name="password" required style="width:100%;padding:8px;">
            </div>
            <button type="submit" style="width:100%;">Login</button>
          </form>
          <div style="margin-top:10px;font-size:13px;color:#666;">
            No account?
            <a href="#" id="switch-to-register">Create one</a>
          </div>
        `
            : `
          <form id="register-form">
            <div style="margin-bottom:10px;">
              <label>Email</label><br>
              <input type="email" name="email" required style="width:100%;padding:8px;">
            </div>
            <div style="margin-bottom:10px;">
              <label>Password</label><br>
              <input type="password" name="password" required minlength="6" style="width:100%;padding:8px;">
            </div>
            <button type="submit" style="width:100%;">Register</button>
          </form>
          <div style="margin-top:10px;font-size:13px;color:#666;">
            Already have an account?
            <a href="#" id="switch-to-login">Login</a>
          </div>
        `
        }
      </div>

      <div id="auth-msg" style="margin-top:12px;"></div>
    </div>
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

function renderTripsScreen() {
  const editing = getEditingTrip();
  const t = editing || emptyTrip();

  resetRouteMapState();

  const rows = state.trips
    .map((trip) => {
      const c = tripCalc(trip);
      return `
      <tr>
        <td>${esc(trip.title)}</td>
        <td>${trip.start_date ? esc(trip.start_date) : "-"}</td>
        <td>${money(c.totalCost)}</td>
        <td>${money(c.costPerPerson)}</td>
        <td style="white-space:nowrap;">
          <button data-edit-trip="${trip.id}">Edit</button>
          <button data-del-trip="${trip.id}">Delete</button>
        </td>
      </tr>`;
    })
    .join("");

  const totalAll = state.trips.reduce((sum, trip) => sum + Number(tripCalc(trip).totalCost || 0), 0);
  const totalFuel = state.trips.reduce((sum, trip) => sum + Number(tripCalc(trip).breakdown?.fuel || 0), 0);
  const totalExtras = state.trips.reduce((sum, trip) => sum + Number(tripCalc(trip).extrasCost || 0), 0);

  layout(`
    <div style="display:grid;grid-template-columns:360px 1fr;gap:16px;align-items:start;">
      <div style="border:1px solid #ddd;border-radius:10px;padding:16px;">
        <h2 style="margin-top:0;">${editing ? "Edit trip" : "New trip"}</h2>
        <form id="trip-form">
          <div style="margin-bottom:8px;">
            <label>Title</label><br>
            <input name="title" required maxlength="255" value="${esc(t.title || "")}" style="width:100%;padding:8px;">
          </div>

          <div style="margin-bottom:10px;padding:10px;border:1px solid #ddd;border-radius:10px;background:#fafafa;">
            <div style="font-weight:600;margin-bottom:8px;">Route map (A → B)</div>

            <div style="margin-bottom:8px;">
              <label>Address A</label><br>
              <div style="display:flex;gap:6px;">
                <input id="route-a-address" type="text" placeholder="Start address" style="width:100%;padding:8px;">
                <button type="button" id="btn-geocode-a">Find A</button>
              </div>
            </div>

            <div style="margin-bottom:8px;">
              <label>Address B</label><br>
              <div style="display:flex;gap:6px;">
                <input id="route-b-address" type="text" placeholder="Destination address" style="width:100%;padding:8px;">
                <button type="button" id="btn-geocode-b">Find B</button>
              </div>
            </div>

            <div style="display:none;">
              <input id="route-a-lat" type="text">
              <input id="route-a-lng" type="text">
              <input id="route-b-lat" type="text">
              <input id="route-b-lng" type="text">
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
              <button type="button" id="btn-mode-a">Click map: A</button>
              <button type="button" id="btn-mode-b">Click map: B</button>
              <button type="button" id="btn-build-route">Build route</button>
            </div>

            <div id="route-map" style="height:260px;border:1px solid #ddd;border-radius:10px;"></div>
            <div id="route-info" style="margin-top:8px;font-size:13px;color:#555;"></div>
          </div>

          <div style="margin-bottom:8px;"><label>Distance (km)</label><br><input name="distance_km" type="number" min="0" step="0.01" value="${Number(t.distance_km || 0)}" style="width:100%;padding:8px;"></div>
          <div style="margin-bottom:8px;"><label>Fuel price</label><br><input name="fuel_price" type="number" min="0" step="0.01" value="${Number(t.fuel_price || 0)}" style="width:100%;padding:8px;"></div>
          <div style="margin-bottom:8px;"><label>Fuel consumption /100km</label><br><input name="fuel_consumption_per_100" type="number" min="0" step="0.01" value="${Number(t.fuel_consumption_per_100 || 0)}" style="width:100%;padding:8px;"></div>
          <div style="margin-bottom:8px;"><label>People count</label><br><input name="people_count" type="number" min="1" step="1" value="${Number(t.people_count || 1)}" style="width:100%;padding:8px;"></div>
          <div style="margin-bottom:8px;"><label>Route cost</label><br><input name="route_cost" type="number" min="0" step="0.01" value="${Number(t.route_cost || 0)}" style="width:100%;padding:8px;"></div>
          <div style="margin-bottom:8px;"><label>Lodging cost</label><br><input name="lodging_cost" type="number" min="0" step="0.01" value="${Number(t.lodging_cost || 0)}" style="width:100%;padding:8px;"></div>
          <div style="margin-bottom:8px;"><label>Food cost</label><br><input name="food_cost" type="number" min="0" step="0.01" value="${Number(t.food_cost || 0)}" style="width:100%;padding:8px;"></div>
          <div style="margin-bottom:8px;"><label>Other cost</label><br><input name="other_cost" type="number" min="0" step="0.01" value="${Number(t.other_cost || 0)}" style="width:100%;padding:8px;"></div>
          <div style="margin-bottom:8px;"><label>Start date</label><br><input name="start_date" type="date" value="${esc(t.start_date || "")}" style="width:100%;padding:8px;"></div>
          <div style="margin-bottom:8px;"><label>End date</label><br><input name="end_date" type="date" value="${esc(t.end_date || "")}" style="width:100%;padding:8px;"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="submit">${editing ? "Update trip" : "Create trip"}</button>
            ${editing ? `<button type="button" id="cancel-edit">Cancel</button>` : ""}
          </div>
        </form>
        <div id="trip-form-msg" style="margin-top:10px;"></div>
      </div>

      <div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:12px;margin-bottom:14px;">
          <div style="border:1px solid #ddd;border-radius:10px;padding:12px;"><div>Trips</div><strong>${state.trips.length}</strong></div>
          <div style="border:1px solid #ddd;border-radius:10px;padding:12px;"><div>Total fuel</div><strong>${money(totalFuel)}</strong></div>
          <div style="border:1px solid #ddd;border-radius:10px;padding:12px;"><div>Total all</div><strong>${money(totalAll)}</strong></div>
        </div>

        <div style="border:1px solid #ddd;border-radius:10px;padding:16px;">
          <h2 style="margin-top:0;">My trips</h2>
          <div style="overflow:auto;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Title</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Date</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Total</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Per person</th>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Actions</th>
                </tr>
              </thead>
              <tbody>${rows || `<tr><td colspan="5" style="padding:10px;">No trips yet.</td></tr>`}</tbody>
            </table>
          </div>
          <div style="margin-top:10px;">Extras total (all trips): <strong>${money(totalExtras)}</strong></div>
        </div>
      </div>
    </div>
  `);

  document.getElementById("trip-form")?.addEventListener("submit", onTripSubmit);
  document.getElementById("cancel-edit")?.addEventListener("click", async () => {
    state.editingTripId = null;
    renderTripsScreen();
  });

  app.querySelectorAll("[data-edit-trip]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.editingTripId = Number(btn.getAttribute("data-edit-trip"));
      renderTripsScreen();
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
        renderTripsScreen();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  ensureMapInit();

  document.getElementById("btn-geocode-a")?.addEventListener("click", () => geocodeAddress("A"));
  document.getElementById("btn-geocode-b")?.addEventListener("click", () => geocodeAddress("B"));
  document.getElementById("btn-build-route")?.addEventListener("click", buildRouteAndFillDistance);

  document.getElementById("btn-mode-a")?.addEventListener("click", () => {
    routePicker.clickMode = "A";
  });
  document.getElementById("btn-mode-b")?.addEventListener("click", () => {
    routePicker.clickMode = "B";
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
      <td>${esc((u.roles || []).join(", "))}</td>
      <td style="white-space:nowrap;">
        <button data-role-user="${u.id}">ROLE_USER</button>
        <button data-role-admin="${u.id}">ROLE_ADMIN</button>
        <button data-del-user="${u.id}">Delete</button>
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
        <td><button data-del-admin-trip="${t.id}">Delete</button></td>
      </tr>`;
    })
    .join("");

  layout(`
    <div style="display:grid;grid-template-columns:1fr;gap:16px;">
      <div style="border:1px solid #ddd;border-radius:10px;padding:16px;">
        <h2 style="margin-top:0;">Admin: users</h2>
        <div style="overflow:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">ID</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Email</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Roles</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Actions</th>
              </tr>
            </thead>
            <tbody>${usersRows || `<tr><td colspan="4" style="padding:10px;">No users.</td></tr>`}</tbody>
          </table>
        </div>
      </div>

      <div style="border:1px solid #ddd;border-radius:10px;padding:16px;">
        <h2 style="margin-top:0;">Admin: trips</h2>
        <div style="overflow:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">ID</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">User</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Title</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Total</th>
                <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Actions</th>
              </tr>
            </thead>
            <tbody>${tripsRows || `<tr><td colspan="5" style="padding:10px;">No trips.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>
  `);

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