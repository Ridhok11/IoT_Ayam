async function loadSettings() {
    try {
        const response = await fetch("/api/v1/settings", {
            cache: "no-store"
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || result.error || "Gagal membaca pengaturan");
        }

        const settings = result.data;

        document.getElementById("mode").value = settings.mode;

        document.getElementById("temperatureOnThreshold").value =
            settings.temperature_threshold;

        const offThreshold = document.getElementById("temperatureOffThreshold");
        if (offThreshold) {
            offThreshold.value = settings.temperature_threshold;
            offThreshold.disabled = true;
            offThreshold.title = "Backend saat ini menggunakan satu batas suhu.";
        }

        updateManualControl();
    } catch (error) {
        console.error("Gagal membaca pengaturan:", error);
        showSettingsMessage(error.message, false);
    }
}

async function saveSettings() {
    const mode = document.getElementById("mode").value;
    const threshold = parseFloat(
        document.getElementById("temperatureOnThreshold").value
    );

    if (!Number.isFinite(threshold) || threshold < -40 || threshold > 80) {
        showSettingsMessage("Batas suhu harus antara -40 dan 80 °C.", false);
        return;
    }

    try {
        const response = await fetch("/api/v1/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mode: mode,
                temperature_threshold: threshold
            })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || result.error || "Gagal menyimpan pengaturan");
        }

        showSettingsMessage("Pengaturan berhasil disimpan.", true);
        updateManualControl();
    } catch (error) {
        console.error("Gagal menyimpan pengaturan:", error);
        showSettingsMessage(error.message, false);
    }
}

function updateManualControl() {
    const mode = document.getElementById("mode");
    const manual = document.getElementById("manualControl");

    if (!mode || !manual) return;

    manual.style.display = mode.value === "MANUAL" ? "block" : "none";
}

async function setRelay(turnOn) {
    try {
        const response = await fetch("/api/v1/relay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                relay_status: turnOn ? 1 : 0
            })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || result.error || "Gagal mengubah relay");
        }

        showSettingsMessage(
            `Perintah relay ${turnOn ? "ON" : "OFF"} berhasil dikirim ke server.`,
            true
        );
    } catch (error) {
        console.error("Gagal mengontrol relay:", error);
        showSettingsMessage(error.message, false);
    }
}

function showSettingsMessage(message, success) {
    const element = document.getElementById("settingsMessage");
    if (!element) return;

    element.textContent = message;
    element.className = success ? "message success" : "message error";
}

document.addEventListener("DOMContentLoaded", () => {
    const mode = document.getElementById("mode");

    if (mode) {
        mode.addEventListener("change", updateManualControl);
        loadSettings();
    }
});
