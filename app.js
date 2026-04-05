let conversation = [];
let currentDraft = null;
let caloriesChart = null;
let macrosChart = null;
let logsCache = [];
let inputMode = "ai";

function formatToday() {
  return new Date().toISOString().split("T")[0];
}

function formatNowTime() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatMealNameFromDateTime(date, time) {
  return `Meal ${date} ${time}`;
}

function updateDateTime() {
  const now = new Date();

  const options = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };

  const formatted = now.toLocaleString('en-GB', options);
  document.getElementById('datetime').textContent = formatted;
}

updateDateTime();
setInterval(updateDateTime, 1000);


function normalizeDate(value) {
  if (!value) return "";

  // Kalau sudah format YYYY-MM-DD
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }

  // Kalau format M/D/YYYY atau MM/DD/YYYY
  if (typeof value === "string" && value.includes("/")) {
    const parts = value.trim().split("/");
    if (parts.length === 3) {
      const month = parts[0].padStart(2, "0");
      const day = parts[1].padStart(2, "0");
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
  }

  // Kalau Date object / string lain yang bisa diparse
  const d = new Date(value);
  if (!isNaN(d)) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return String(value).trim();
}

document.getElementById("log-date").value = formatToday();
document.getElementById("log-time").value = formatNowTime();

function switchScreen(screenName) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  document.getElementById(`screen-${screenName}`).classList.add("active");
  document.querySelector(`.nav-btn[data-screen="${screenName}"]`).classList.add("active");
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    const screen = btn.dataset.screen;
    switchScreen(screen);

    if (screen === "logs") {
      await loadLogs();
    }

    if (screen === "analytics") {
      await loadAnalytics();
    }
  });
});

function switchInputMode(mode) {
  inputMode = mode;

  const aiPanel = document.getElementById("ai-mode-panel");
  const manualPanel = document.getElementById("manual-mode-panel");
  const aiBtn = document.getElementById("mode-ai-btn");
  const manualBtn = document.getElementById("mode-manual-btn");

  if (mode === "ai") {
    aiPanel.classList.remove("hidden");
    manualPanel.classList.add("hidden");
    aiBtn.classList.add("active");
    manualBtn.classList.remove("active");
  } else {
    aiPanel.classList.add("hidden");
    manualPanel.classList.remove("hidden");
    aiBtn.classList.remove("active");
    manualBtn.classList.add("active");
  }
}

function buildManualDraftFromForm() {
  const manualRows = document.querySelectorAll("#manual-items-container [data-manual-item]");
  const items = [];

  manualRows.forEach((row) => {
    const foodName = row.querySelector(".manual-food-name")?.value.trim() || "";
    const quantityNote = row.querySelector(".manual-quantity-note")?.value.trim() || "";
    const calories = Number(row.querySelector(".manual-calories")?.value || 0);
    const protein = Number(row.querySelector(".manual-protein")?.value || 0);
    const carbs = Number(row.querySelector(".manual-carbs")?.value || 0);
    const fat = Number(row.querySelector(".manual-fat")?.value || 0);

    if (foodName) {
      items.push({
        food_name: foodName,
        quantity_note: quantityNote,
        calories,
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat
      });
    }
  });

  if (!items.length) {
  return null;
}

  const total = items.reduce(
    (acc, item) => {
      acc.calories += Number(item.calories || 0);
      acc.protein_g += Number(item.protein_g || 0);
      acc.carbs_g += Number(item.carbs_g || 0);
      acc.fat_g += Number(item.fat_g || 0);
      return acc;
    },
    {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0
    }
  );

  return {
    items,
    total
  };
}

function autoPreviewManualEntry() {
  if (inputMode !== "manual") return;

  const manualDraft = buildManualDraftFromForm();

  if (!manualDraft) {
    currentDraft = null;
    renderDraft();
    return;
  }

  currentDraft = manualDraft;
  renderDraft();
}

function previewManualEntry() {
  const manualDraft = buildManualDraftFromForm();
  if (!manualDraft) return;

  currentDraft = manualDraft;
  renderDraft();
}

function resetManualForm() {
  renderManualItems(1);
}

function addMessage(role, text) {
  const chatBox = document.getElementById("chat-box");
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function extractJson(text) {
  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("No JSON object found in model response");
  }

  const jsonString = cleaned.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonString);
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    toast.style.transition = "0.2s ease";
  }, 2600);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function createManualItemHTML(index) {
  return `
    <div class="manual-item-card" data-manual-item>
      <div class="manual-item-head">
        <h3>Item ${index + 1}</h3>
        <button type="button" class="manual-remove-btn" onclick="removeManualItem(this)">Remove</button>
      </div>

      <div class="manual-grid">
        <label>
          Food Name
          <input type="text" class="manual-food-name" placeholder="i.e: Greek Yogurt" />
        </label>

        <label>
          Quantity Note
          <input type="text" class="manual-quantity-note" placeholder="i.e: 1 cup / 150 g / 1 bar" />
        </label>

        <label>
          Calories
          <input type="number" class="manual-calories" step="0.1" placeholder="0" />
        </label>

        <label>
          Protein (g)
          <input type="number" class="manual-protein" step="0.1" placeholder="0" />
        </label>

        <label>
          Carbs (g)
          <input type="number" class="manual-carbs" step="0.1" placeholder="0" />
        </label>

        <label>
          Fat (g)
          <input type="number" class="manual-fat" step="0.1" placeholder="0" />
        </label>
      </div>
    </div>
  `;
}

function renderManualItems(count = 1) {
  const container = document.getElementById("manual-items-container");
  container.innerHTML = "";

  for (let i = 0; i < count; i++) {
    container.insertAdjacentHTML("beforeend", createManualItemHTML(i));
  }

  updateManualItemTitles();
}

function addManualItem() {
  const container = document.getElementById("manual-items-container");
  const currentCount = container.querySelectorAll("[data-manual-item]").length;

  container.insertAdjacentHTML("beforeend", createManualItemHTML(currentCount));
  updateManualItemTitles();
  autoPreviewManualEntry();
}

function removeManualItem(button) {
  const container = document.getElementById("manual-items-container");
  const allItems = container.querySelectorAll("[data-manual-item]");

  if (allItems.length <= 1) {
    alert("At least one item.");
    return;
  }

  button.closest("[data-manual-item]").remove();
  updateManualItemTitles();
  autoPreviewManualEntry();
}

function updateManualItemTitles() {
  const items = document.querySelectorAll("#manual-items-container [data-manual-item]");

  items.forEach((item, index) => {
    const title = item.querySelector(".manual-item-head h3");
    if (title) {
      title.textContent = `Item ${index + 1}`;
    }
  });
}

function renderDraft() {
  const rawOutput = document.getElementById("draft-output");
  const draftEmpty = document.getElementById("draft-empty");
  const draftPretty = document.getElementById("draft-pretty");
  const draftItems = document.getElementById("draft-items");

  if (!currentDraft || !currentDraft.items || currentDraft.items.length === 0) {
    rawOutput.textContent = currentDraft
      ? JSON.stringify(currentDraft, null, 2)
      : "Belum ada draft.";

    draftEmpty.classList.remove("hidden");
    draftPretty.classList.add("hidden");
    draftItems.innerHTML = "";

    document.getElementById("total-calories").textContent = "0";
    document.getElementById("total-protein").textContent = "0 g";
    document.getElementById("total-carbs").textContent = "0 g";
    document.getElementById("total-fat").textContent = "0 g";
    return;
  }

  rawOutput.textContent = JSON.stringify(currentDraft, null, 2);
  draftEmpty.classList.add("hidden");
  draftPretty.classList.remove("hidden");

  draftItems.innerHTML = currentDraft.items
    .map((item) => `
      <div class="draft-item">
        <div class="draft-item-top">
          <div>
            <div class="draft-food-name">${item.food_name || "-"}</div>
            <div class="draft-quantity">${item.quantity_note || "-"}</div>
          </div>
          <div class="kcal-badge">${Number(item.calories || 0).toFixed(0)} kcal</div>
        </div>

        <div class="macro-row">
          <div class="macro-chip">P ${Number(item.protein_g || 0).toFixed(1)} g</div>
          <div class="macro-chip">C ${Number(item.carbs_g || 0).toFixed(1)} g</div>
          <div class="macro-chip">F ${Number(item.fat_g || 0).toFixed(1)} g</div>
        </div>
      </div>
    `)
    .join("");

  document.getElementById("total-calories").textContent =
    Number(currentDraft.total?.calories || 0).toFixed(0) + " kcal";

  document.getElementById("total-protein").textContent =
    Number(currentDraft.total?.protein_g || 0).toFixed(1) + " g";

  document.getElementById("total-carbs").textContent =
    Number(currentDraft.total?.carbs_g || 0).toFixed(1) + " g";

  document.getElementById("total-fat").textContent =
    Number(currentDraft.total?.fat_g || 0).toFixed(1) + " g";
}

async function callAIFromAppsScript(userMessage) {
  const payload = {
    action: "ai_chat",
    conversation,
    user_message: userMessage
  };

  const formData = new FormData();
  formData.append("payload", JSON.stringify(payload));

  const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    body: formData
  });

  const result = await response.json();
  console.log("AI via Apps Script response:", result);

  if (!result.success) {
    throw new Error(result.error || "AI request failed");
  }

  return result.data;
}

async function sendMessage() {
  const input = document.getElementById("user-input");
  const text = input.value.trim();

  if (!text) return;

  addMessage("user", text);
  conversation.push({ role: "user", text });

  input.value = "";

  try {
    const result = await callAIFromAppsScript(text);

    addMessage("ai", result.assistant_message);
    conversation.push({ role: "ai", text: result.assistant_message });

    currentDraft = result.session_state;
    renderDraft();
  } catch (error) {
    console.error("SEND MESSAGE ERROR:", error);
    addMessage("ai", `Maaf, terjadi error saat memproses estimasi.\n\n${error.message}`);
  }
}

function generateSessionId() {
  return `session_${Date.now()}`;
}

async function saveFinal() {
  if (!currentDraft || !currentDraft.items || currentDraft.items.length === 0) {
    alert("No draft to save");
    return;
  }

  const date = document.getElementById("log-date").value;
  const time = document.getElementById("log-time").value;
  let mealName = document.getElementById("meal-name").value.trim();

  if (!mealName) {
    mealName = formatMealNameFromDateTime(date, time);
    document.getElementById("meal-name").value = mealName;
  }

  const payload = {
  action: "append_food_items",
  date,
  time,
  session_id: generateSessionId(),
  meal_name: mealName,
  source: inputMode === "manual" ? "manual" : "ai",
  notes: inputMode === "manual"
    ? "saved from manual entry"
    : "saved from conversational AI",
  items: currentDraft.items
};

  console.log("Saving payload to Apps Script:", payload);

  const formData = new FormData();
  formData.append("payload", JSON.stringify(payload));

  try {
    const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      body: formData
    });

    const result = await response.json();
    console.log("Apps Script save response:", result);

    if (result.success) {
      showToast(`Saved ${result.inserted} item.`, "success");
      resetDraft();
      document.getElementById("meal-name").value = "";
      document.getElementById("log-date").value = formatToday();
      document.getElementById("log-time").value = formatNowTime();
      await loadLogs();
      await loadAnalytics();
    } else {
      showToast(`Failed to save: ${result.error || "Unknown error"}`, "error");
    }
  } catch (error) {
    console.error("SAVE FINAL ERROR:", error);
    showToast(`Failed to save to Google Sheets: ${error.message}`, "error");
  }
}

function resetDraft() {
  conversation = [];
  currentDraft = null;
  document.getElementById("chat-box").innerHTML = "";
  resetManualForm();
  renderDraft();
}

async function fetchSheetData(action) {
  const url = `${CONFIG.APPS_SCRIPT_URL}?action=${action}`;
  const response = await fetch(url);
  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || `Failed to fetch ${action}`);
  }

  return result.data || [];
}

function groupLogsBySession(logs) {
  const grouped = {};

  logs.forEach(log => {
    const sessionId = log.session_id || `no_session_${log.date}_${log.time}`;

    if (!grouped[sessionId]) {
      grouped[sessionId] = {
        session_id: sessionId,
        date: log.date,
        time: log.time,
        meal_name: log.meal_name,
        items: [],
        total_calories: 0,
        total_protein_g: 0,
        total_carbs_g: 0,
        total_fat_g: 0
      };
    }

    grouped[sessionId].items.push(log);
    grouped[sessionId].total_calories += Number(log.calories || 0);
    grouped[sessionId].total_protein_g += Number(log.protein_g || 0);
    grouped[sessionId].total_carbs_g += Number(log.carbs_g || 0);
    grouped[sessionId].total_fat_g += Number(log.fat_g || 0);
  });

  return Object.values(grouped).reverse();
}

async function loadLogs() {
  const container = document.getElementById("logs-container");
  const filterDate = document.getElementById("logs-filter-date").value;

  container.innerHTML = `<div class="draft-empty">Loading logs...</div>`;

  try {
    let logs = await fetchSheetData("logs");
    logsCache = logs;

    if (filterDate) {
      logs = logs.filter(log => normalizeDate(log.date) === filterDate);
    }

    if (!logs.length) {
      container.innerHTML = `<div class="draft-empty">Belum ada data logs.</div>`;
      return;
    }

    const groupedSessions = groupLogsBySession(logs);

    container.innerHTML = groupedSessions
      .map(session => `
        <div class="log-card">
          <div class="log-card-top">
            <div>
              <div class="log-title">${session.meal_name || "Meal"}</div>
              <div class="log-meta">
                ${normalizeDate(session.date)} • ${session.time || "-"}
              </div>
              <div class="log-meta">${session.items.length} item(s)</div>
            </div>
            <div class="kcal-badge">${session.total_calories.toFixed(0)} kcal</div>
          </div>

          <div class="macro-row" style="margin-bottom: 12px;">
            <div class="macro-chip">P ${session.total_protein_g.toFixed(1)} g</div>
            <div class="macro-chip">C ${session.total_carbs_g.toFixed(1)} g</div>
            <div class="macro-chip">F ${session.total_fat_g.toFixed(1)} g</div>
          </div>

          <div>
            ${session.items
  .map(item => `
    <div class="draft-item" style="margin-bottom: 10px;">
      <div class="draft-item-top">
        <div>
          <div class="draft-food-name">${item.food_name || "-"}</div>
          <div class="draft-quantity">${item.quantity_note || "-"}</div>
        </div>
        <div class="kcal-badge">${Number(item.calories || 0).toFixed(0)} kcal</div>
      </div>

      <div class="macro-row">
        <div class="macro-chip">P ${Number(item.protein_g || 0).toFixed(1)} g</div>
        <div class="macro-chip">C ${Number(item.carbs_g || 0).toFixed(1)} g</div>
        <div class="macro-chip">F ${Number(item.fat_g || 0).toFixed(1)} g</div>
      </div>

     <div class="actions" style="margin-top: 10px;">
        <button class="btn btn-primary" onclick='openEditModalById("${item.log_id}")'>Edit</button>
        <button class="btn btn-danger-soft" onclick='deleteLog("${item.log_id}")'>Delete</button>
      </div>
    </div>
  `)
  .join("")}
          </div>
        </div>
      `)
      .join("");
  } catch (error) {
    console.error("LOAD LOGS ERROR:", error);
    container.innerHTML = `<div class="draft-empty">Gagal memuat logs.<br>${error.message}</div>`;
  }
}

function openEditModalById(logId) {
  const item = logsCache.find(log => String(log.log_id) === String(logId));
  if (!item) return;

  document.getElementById("edit-log-id").value = item.log_id || "";
  document.getElementById("edit-food-name").value = item.food_name || "";
  document.getElementById("edit-quantity-note").value = item.quantity_note || "";
  document.getElementById("edit-calories").value = item.calories || 0;
  document.getElementById("edit-protein").value = item.protein_g || 0;
  document.getElementById("edit-carbs").value = item.carbs_g || 0;
  document.getElementById("edit-fat").value = item.fat_g || 0;

  document.getElementById("edit-modal").classList.remove("hidden");
}

function closeEditModal() {
  document.getElementById("edit-modal").classList.add("hidden");
}

async function deleteLog(logId) {
  const confirmed = confirm("Are you sure to delete this log?");
  if (!confirmed) return;

  const payload = {
    action: "delete_log",
    log_id: logId
  };

  const formData = new FormData();
  formData.append("payload", JSON.stringify(payload));

  try {
    const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      showToast("Log deleted.", "success");
      await loadLogs();
      await loadAnalytics();
    } else {
      showToast(`Failed to delete: ${result.error || "Unknown error"}`, "error");
    }
  } catch (error) {
    console.error("DELETE LOG ERROR:", error);
    showToast(`Failed to delete log: ${error.message}`, "error");
  }
}

async function saveEditedLog() {
  const payload = {
    action: "update_log",
    log_id: document.getElementById("edit-log-id").value,
    food_name: document.getElementById("edit-food-name").value.trim(),
    quantity_note: document.getElementById("edit-quantity-note").value.trim(),
    calories: Number(document.getElementById("edit-calories").value || 0),
    protein_g: Number(document.getElementById("edit-protein").value || 0),
    carbs_g: Number(document.getElementById("edit-carbs").value || 0),
    fat_g: Number(document.getElementById("edit-fat").value || 0)
  };

  const formData = new FormData();
  formData.append("payload", JSON.stringify(payload));

  try {
    const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      showToast("Log updated.", "success");
      closeEditModal();
      await loadLogs();
      await loadAnalytics();
    } else {
      showToast(`Failed to update: ${result.error || "Unknown error"}`, "error");
    }
  } catch (error) {
    console.error("UPDATE LOG ERROR:", error);
    showToast(`Failed to update log: ${error.message}`, "error");
  }
}

function renderAnalyticsCharts(dailyData) {
  const sortedDaily = [...dailyData]
    .map(day => ({
      ...day,
      normalized_date: normalizeDate(day.date)
    }))
    .sort((a, b) => new Date(a.normalized_date) - new Date(b.normalized_date))
    .slice(-7);

  const labels = sortedDaily.map(day => day.normalized_date);
  const calories = sortedDaily.map(day => Number(day.total_calories || 0));
  const protein = sortedDaily.map(day => Number(day.total_protein_g || 0));
  const carbs = sortedDaily.map(day => Number(day.total_carbs_g || 0));
  const fat = sortedDaily.map(day => Number(day.total_fat_g || 0));

  const caloriesCanvas = document.getElementById("calories-chart");
  const macrosCanvas = document.getElementById("macros-chart");

  if (!caloriesCanvas || !macrosCanvas) return;

  if (caloriesChart) {
    caloriesChart.destroy();
  }

  if (macrosChart) {
    macrosChart.destroy();
  }

  caloriesChart = new Chart(caloriesCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Calories",
          data: calories,
          borderColor: "#ff69b4",
          backgroundColor: "rgba(255, 105, 180, 0.15)",
          fill: true,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true
        }
      }
    }
  });

  macrosChart = new Chart(macrosCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Protein",
          data: protein,
          backgroundColor: "#ff8fc7"
        },
        {
          label: "Carbs",
          data: carbs,
          backgroundColor: "#c79bff"
        },
        {
          label: "Fat",
          data: fat,
          backgroundColor: "#ffb86c"
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true
        }
      }
    }
  });
}

async function loadAnalytics() {
  const dailyContainer = document.getElementById("daily-summary-container");
  const monthlyContainer = document.getElementById("monthly-summary-container");

  dailyContainer.innerHTML = `<div class="draft-empty">Loading daily summary...</div>`;
  monthlyContainer.innerHTML = `<div class="draft-empty">Loading monthly summary...</div>`;

  try {
   const dailyData = await fetchSheetData("daily_summary");
const monthlyData = await fetchSheetData("monthly_summary");
const targetsData = await fetchSheetData("targets");

renderAnalyticsCharts(dailyData);

  const today = formatToday();
const todayRow = dailyData.find(row => normalizeDate(row.date) === today);

const targetsRow = targetsData && targetsData.length > 0 ? targetsData[0] : null;

const todayCalories = Number(todayRow?.total_calories || 0);
const todayProtein = Number(todayRow?.total_protein_g || 0);
const todayCarbs = Number(todayRow?.total_carbs_g || 0);
const todayFat = Number(todayRow?.total_fat_g || 0);

const targetCalories = Number(todayRow?.calorie_target || targetsRow?.calorie_target || 0);
const targetProtein = Number(todayRow?.protein_target || targetsRow?.protein_target || 0);
const targetCarbs = Number(todayRow?.carbs_target || targetsRow?.carbs_target || 0);
const targetFat = Number(todayRow?.fat_target || targetsRow?.fat_target || 0);

document.getElementById("analytics-today-calories").textContent =
  `${todayCalories.toFixed(0)} / ${targetCalories.toFixed(0)} kcal`;

document.getElementById("analytics-today-protein").textContent =
  `${todayProtein.toFixed(1)} / ${targetProtein.toFixed(1)} g`;

document.getElementById("analytics-today-carbs").textContent =
  `${todayCarbs.toFixed(1)} / ${targetCarbs.toFixed(1)} g`;

document.getElementById("analytics-today-fat").textContent =
  `${todayFat.toFixed(1)} / ${targetFat.toFixed(1)} g`;

document.getElementById("analytics-calories-remaining").textContent =
  `Remaining: ${(targetCalories - todayCalories).toFixed(0)} kcal`;

document.getElementById("analytics-protein-remaining").textContent =
  `Remaining: ${(targetProtein - todayProtein).toFixed(1)} g`;

document.getElementById("analytics-carbs-remaining").textContent =
  `Remaining: ${(targetCarbs - todayCarbs).toFixed(1)} g`;

document.getElementById("analytics-fat-remaining").textContent =
  `Remaining: ${(targetFat - todayFat).toFixed(1)} g`;

    const recentDaily = [...dailyData].reverse().slice(0, 10);

    dailyContainer.innerHTML = recentDaily.length
      ? recentDaily
          .map(day => `
            <div class="day-card">
              <div class="log-card-top">
                <div>
                  <div class="log-title">${normalizeDate(day.date)}</div>
                  <div class="log-meta">
                    ${day.meal_count || 0} meals • ${day.food_count || 0} foods
                  </div>
                </div>
                <div class="kcal-badge">${Number(day.total_calories || 0).toFixed(0)} kcal</div>
              </div>

              <div class="macro-row">
                <div class="macro-chip">P ${Number(day.total_protein_g || 0).toFixed(1)} g</div>
                <div class="macro-chip">C ${Number(day.total_carbs_g || 0).toFixed(1)} g</div>
                <div class="macro-chip">F ${Number(day.total_fat_g || 0).toFixed(1)} g</div>
              </div>
            </div>
          `)
          .join("")
      : `<div class="draft-empty">Belum ada daily summary.</div>`;

    const recentMonthly = [...monthlyData].reverse().slice(0, 6);

    monthlyContainer.innerHTML = recentMonthly.length
      ? recentMonthly
          .map(month => `
            <div class="month-card">
              <div class="log-card-top">
                <div>
                  <div class="log-title">${month.month_key || "-"}</div>
                  <div class="log-meta">${month.days_logged || 0} days logged</div>
                </div>
                <div class="kcal-badge">${Number(month.avg_daily_calories || 0).toFixed(0)} avg kcal</div>
              </div>

              <div class="macro-row">
                <div class="macro-chip">Avg P ${Number(month.avg_daily_protein_g || 0).toFixed(1)} g</div>
                <div class="macro-chip">Avg C ${Number(month.avg_daily_carbs_g || 0).toFixed(1)} g</div>
                <div class="macro-chip">Avg F ${Number(month.avg_daily_fat_g || 0).toFixed(1)} g</div>
              </div>
            </div>
          `)
          .join("")
      : `<div class="draft-empty">Belum ada monthly summary.</div>`;
  } catch (error) {
    console.error("LOAD ANALYTICS ERROR:", error);
    dailyContainer.innerHTML = `<div class="draft-empty">Gagal memuat daily summary.<br>${error.message}</div>`;
    monthlyContainer.innerHTML = `<div class="draft-empty">Gagal memuat monthly summary.<br>${error.message}</div>`;
  }
}

document.getElementById("send-btn").addEventListener("click", sendMessage);
document.getElementById("save-btn").addEventListener("click", saveFinal);
document.getElementById("reset-btn").addEventListener("click", resetDraft);

document.getElementById("refresh-logs-btn").addEventListener("click", loadLogs);
document.getElementById("refresh-analytics-btn").addEventListener("click", loadAnalytics);
document.getElementById("logs-filter-date").addEventListener("change", loadLogs);

document.getElementById("close-edit-modal").addEventListener("click", closeEditModal);
document.getElementById("save-edit-btn").addEventListener("click", saveEditedLog);


document.getElementById("mode-ai-btn").addEventListener("click", () => {
  switchInputMode("ai");
});

document.getElementById("mode-manual-btn").addEventListener("click", () => {
  switchInputMode("manual");
  autoPreviewManualEntry();
});
document.getElementById("manual-items-container").addEventListener("input", () => {
  autoPreviewManualEntry();
});

document.getElementById("preview-manual-btn").addEventListener("click", previewManualEntry);
document.getElementById("save-btn-manual").addEventListener("click", async () => {
  const manualDraft = buildManualDraftFromForm();

  if (!manualDraft) {
    showToast("Insert at least 1 item before saving.", "error");
    return;
  }

  currentDraft = manualDraft;
  renderDraft();
  await saveFinal();
});

document.getElementById("reset-manual-btn").addEventListener("click", () => {
  resetManualForm();
  autoPreviewManualEntry();
});

document.getElementById("add-manual-item-btn").addEventListener("click", addManualItem);

renderManualItems(1);
renderDraft();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then((registration) => {
        console.log("Service Worker registered:", registration);
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });
  });
}
