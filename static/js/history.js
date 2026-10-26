"use strict";

const HISTORY_API_URL = "/api/v1/readings/history?limit=100";

let historyData = [];
let historyRefreshTimer = null;

const historyElements = {
    tbody: document.getElementById("historyTableBody"),
    search: document.getElementById("historySearch"),
    startDate: document.getElementById("historyStartDate"),
    endDate: document.getElementById("historyEndDate"),
    total: document.getElementById("historyTotal"),
    maxTemperature: document.getElementById("historyMaxTemperature"),
    maxHumidity: document.getElementById("historyMaxHumidity"),
    resultCount: document.getElementById("historyResultCount"),
    lastUpdate: document.getElementById("historyLastUpdate"),
    reset: document.getElementById("historyReset"),
    refresh: document.getElementById("historyRefresh")
};

function getReadingDate(item) {
    const value = item.created_at ?? item.recorded_at ?? item.timestamp;

    if (!value) {
        return null;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
    const date = value instanceof Date ? value : getReadingDate(value);

    if (!date) {
        return "Waktu tidak tersedia";
    }

    return date.toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function getRelayStatus(item) {
    const value = item.relay_status;

    if (value === undefined || value === null || value === "") {
        return null;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();

        if (["on", "aktif", "true"].includes(normalized)) {
            return true;
        }

        if (["off", "mati", "false"].includes(normalized)) {
            return false;
        }
    }

    return Number(value) === 1;
}

function formatNumber(value, suffix = "") {
    const number = Number(value);

    if (value === null || value === undefined || value === "" ||
        !Number.isFinite(number)) {
        return "—";
    }

    return `${number.toLocaleString("id-ID", {
        maximumFractionDigits: 1
    })}${suffix}`;
}

async function loadHistory() {
    if (!historyElements.tbody) {
        return;
    }

    if (historyElements.refresh) {
        historyElements.refresh.disabled = true;
        historyElements.refresh.textContent = "Memuat...";
    }

    try {
        const response = await fetch(HISTORY_API_URL, {
            cache: "no-store",
            headers: {
                "Accept": "application/json"
            }
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || result.error || "Gagal mengambil riwayat sensor."
            );
        }

        if (!Array.isArray(result.data)) {
            throw new Error("Format data riwayat dari API tidak sesuai.");
        }

        historyData = result.data.slice().sort((a, b) => {
            const dateA = getReadingDate(a);
            const dateB = getReadingDate(b);

            return (dateB?.getTime() ?? 0) - (dateA?.getTime() ?? 0);
        });

        renderHistory();

        if (historyElements.lastUpdate) {
            historyElements.lastUpdate.textContent =
                `Diperbarui ${new Date().toLocaleTimeString("id-ID")}`;
        }
    } catch (error) {
        console.error("Gagal memuat riwayat sensor:", error);

        if (historyElements.tbody) {
            historyElements.tbody.replaceChildren();

            const row = document.createElement("tr");
            const cell = document.createElement("td");

            cell.colSpan = 6;
            cell.className = "history-message history-error";
            cell.textContent = "Gagal memuat data. Periksa koneksi dan endpoint API, lalu coba Muat Ulang.";

            row.appendChild(cell);
            historyElements.tbody.appendChild(row);
        }

        if (historyElements.resultCount) {
            historyElements.resultCount.textContent = "Data tidak berhasil dimuat.";
        }
    } finally {
        if (historyElements.refresh) {
            historyElements.refresh.disabled = false;
            historyElements.refresh.textContent = "↻ Muat Ulang";
        }
    }
}

function getFilteredHistory() {
    const query = (historyElements.search?.value ?? "").trim().toLowerCase();
    const startValue = historyElements.startDate?.value ?? "";
    const endValue = historyElements.endDate?.value ?? "";

    return historyData.filter(item => {
        const date = getReadingDate(item);

        if (startValue) {
            if (!date || date < new Date(`${startValue}T00:00:00`)) {
                return false;
            }
        }

        if (endValue) {
            if (!date || date > new Date(`${endValue}T23:59:59.999`)) {
                return false;
            }
        }

        const relayStatus = getRelayStatus(item);
        const relayText = relayStatus === null
            ? "tidak tersedia"
            : relayStatus ? "on aktif hidup" : "off mati nonaktif";

        const searchableText = [
            formatDate(item),
            item.temperature,
            item.humidity,
            item.mode,
            relayText,
            item.id
        ].join(" ").toLowerCase();

        return searchableText.includes(query);
    });
}

function renderHistory() {
    const tbody = historyElements.tbody;

    if (!tbody) {
        return;
    }

    const filtered = getFilteredHistory();

    updateStatistics(filtered);
    tbody.replaceChildren();

    if (filtered.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 6;
        cell.className = "history-message";
        cell.textContent = historyData.length
            ? "Tidak ada data yang sesuai dengan pencarian atau filter."
            : "Belum ada data pembacaan sensor.";

        row.appendChild(cell);
        tbody.appendChild(row);
    } else {
        filtered.forEach((item, index) => {
            const row = document.createElement("tr");
            const relayStatus = getRelayStatus(item);

            const values = [
                index + 1,
                formatDate(item),
                formatNumber(item.temperature, " °C"),
                formatNumber(item.humidity, " %"),
                item.mode ?? "—"
            ];

            values.forEach((value, cellIndex) => {
                const cell = document.createElement("td");
                cell.textContent = String(value);

                if (cellIndex === 2) {
                    cell.className = "temperature-cell";
                }

                if (cellIndex === 3) {
                    cell.className = "humidity-cell";
                }

                row.appendChild(cell);
            });

            const relayCell = document.createElement("td");

            if (relayStatus === null) {
                relayCell.textContent = "Tidak tersedia";
                relayCell.className = "relay-badge relay-unknown";
            } else {
                relayCell.textContent = relayStatus ? "ON" : "OFF";
                relayCell.className = relayStatus
                    ? "relay-badge relay-on"
                    : "relay-badge relay-off";
            }

            row.appendChild(relayCell);
            tbody.appendChild(row);
        });
    }

    if (historyElements.resultCount) {
        historyElements.resultCount.textContent =
            `Menampilkan ${filtered.length} dari ${historyData.length} data`;
    }
}

function updateStatistics(data) {
    if (historyElements.total) {
        historyElements.total.textContent =
            data.length.toLocaleString("id-ID");
    }

    const temperatures = data
        .map(item => Number(item.temperature))
        .filter(Number.isFinite);

    const humidities = data
        .map(item => Number(item.humidity))
        .filter(Number.isFinite);

    if (historyElements.maxTemperature) {
        historyElements.maxTemperature.textContent = temperatures.length
            ? formatNumber(Math.max(...temperatures), " °C")
            : "—";
    }

    if (historyElements.maxHumidity) {
        historyElements.maxHumidity.textContent = humidities.length
            ? formatNumber(Math.max(...humidities), " %")
            : "—";
    }
}

function resetHistoryFilters() {
    if (historyElements.search) {
        historyElements.search.value = "";
    }

    if (historyElements.startDate) {
        historyElements.startDate.value = "";
    }

    if (historyElements.endDate) {
        historyElements.endDate.value = "";
    }

    renderHistory();
}

function setupHistoryEvents() {
    historyElements.search?.addEventListener("input", renderHistory);
    historyElements.startDate?.addEventListener("change", renderHistory);
    historyElements.endDate?.addEventListener("change", renderHistory);
    historyElements.reset?.addEventListener("click", resetHistoryFilters);
    historyElements.refresh?.addEventListener("click", loadHistory);
}

document.addEventListener("DOMContentLoaded", () => {
    setupHistoryEvents();
    loadHistory();

    historyRefreshTimer = window.setInterval(loadHistory, 15000);
});

window.addEventListener("beforeunload", () => {
    if (historyRefreshTimer !== null) {
        window.clearInterval(historyRefreshTimer);
    }
});
