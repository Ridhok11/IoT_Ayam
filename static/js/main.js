const API_BASE = "/api/v1";
const OFFLINE_TIMEOUT = 15000;

async function checkSystemStatus() {
    try {
        const response = await fetch(
            `${API_BASE}/readings/latest`,
            { cache: "no-store" }
        );

        if (!response.ok) {
            throw new Error("Gagal mengambil data sensor");
        }

        const result = await response.json();
        const reading = result.data;

        if (
            !result.success ||
            !reading ||
            !reading.created_at
        ) {
            throw new Error("Data sensor tidak tersedia");
        }

        const readingTime = new Date(
            reading.created_at.replace(" ", "T")
        ).getTime();

        const age = Date.now() - readingTime;

        const online =
            Number.isFinite(readingTime) &&
            age >= -60000 &&
            age <= OFFLINE_TIMEOUT;

        updateStatusUI(online);

    } catch (error) {
        updateStatusUI(false);
        console.error(
            "Pemeriksaan status perangkat:",
            error
        );
    }
}

function updateStatusUI(online) {
    const status = document.getElementById("systemStatus");
    const dot = document.getElementById("sidebarStatusDot");
    const text = document.getElementById("sidebarStatusText");

    if (status) {
        status.innerHTML = `
            <span class="status-dot ${online ? "online" : "offline"}"></span>
            <span>${online ? "ONLINE" : "OFFLINE"}</span>
        `;
    }

    if (dot) {
        dot.className =
            `status-dot ${online ? "online" : "offline"}`;
    }

    if (text) {
        text.textContent = online
            ? "ESP32 Online"
            : "ESP32 Offline";
    }
}

checkSystemStatus();

setInterval(checkSystemStatus, 3000);
