(() => {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const API_URL = "/api/v1/readings/latest";
    const OFFLINE_AFTER_SECONDS = 60;

    // Batas awal ini hanya untuk indikator umum, bukan standar universal
    // semua umur dan jenis ayam. Sesuaikan dengan kebutuhan peternakan.
    const TEMP_MIN = 24;
    const TEMP_MAX = 30;
    const HUMIDITY_MIN = 50;
    const HUMIDITY_MAX = 70;

    let requestRunning = false;

    function setText(id, value) {
        const el = $(id);
        if (el) el.textContent = value;
    }

    function readValue(obj, keys) {
        for (const key of keys) {
            if (obj && obj[key] !== undefined && obj[key] !== null) {
                return obj[key];
            }
        }
        return null;
    }

    function formatNumber(value, suffix) {
        const number = Number(value);
        return Number.isFinite(number)
            ? `${number.toFixed(1)} ${suffix}`
            : `-- ${suffix}`;
    }

    function setConnection(online, label) {
        const badge = $("farmConnectionBadge");
        if (!badge) return;

        badge.textContent = online ? "🟢 ESP32 terhubung" : `🔴 ${label}`;
        badge.classList.toggle("is-online", online);
        badge.classList.toggle("is-offline", !online);
    }

    function setCondition(title, message, level) {
        setText("farmConditionTitle", title);
        setText("farmConditionMessage", message);

        const panel = $("farmConditionPanel");
        if (panel) {
            panel.classList.remove("condition-good", "condition-warn", "condition-bad");
            panel.classList.add(
                level === "good" ? "condition-good" :
                level === "bad" ? "condition-bad" : "condition-warn"
            );
        }
    }

    function parseTimestamp(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function updateFromReading(reading) {
        const temperature = Number(readValue(reading, ["temperature", "suhu"]));
        const humidity = Number(readValue(reading, ["humidity", "kelembapan"]));
        const relay = readValue(reading, ["relay_status", "relay", "relay_state"]);
        const timestamp = parseTimestamp(
            readValue(reading, ["created_at", "timestamp", "updated_at"])
        );

        const validTemperature = Number.isFinite(temperature);
        const validHumidity = Number.isFinite(humidity);

        setText("farmTemperature", validTemperature
            ? formatNumber(temperature, "°C") : "-- °C");
        setText("farmHumidity", validHumidity
            ? formatNumber(humidity, "%") : "-- %");

        if (validTemperature) {
            setText("farmTemperatureStatus",
                temperature < TEMP_MIN ? "Di bawah rentang indikator" :
                temperature > TEMP_MAX ? "Di atas rentang indikator" :
                "Dalam rentang indikator");
        } else {
            setText("farmTemperatureStatus", "Data tidak valid");
        }

        if (validHumidity) {
            setText("farmHumidityStatus",
                humidity < HUMIDITY_MIN ? "Di bawah rentang indikator" :
                humidity > HUMIDITY_MAX ? "Di atas rentang indikator" :
                "Dalam rentang indikator");
        } else {
            setText("farmHumidityStatus", "Data tidak valid");
        }

        const relayNumber = Number(relay);
        const relayIsOn = relay === true || relay === "1" || relayNumber === 1;

        if (relay === null) {
            setText("farmRelay", "Tidak diketahui");
            setText("farmRelayStatus", "Status relay tidak tersedia");
        } else {
            setText("farmRelay", relayIsOn ? "ON" : "OFF");
            setText("farmRelayStatus", "Berdasarkan data relay API");
        }

        if (timestamp) {
            const ageSeconds = Math.max(0, (Date.now() - timestamp.getTime()) / 1000);
            setText("farmLastUpdate",
                `Pembaruan terakhir: ${timestamp.toLocaleString("id-ID")}`);

            if (ageSeconds > OFFLINE_AFTER_SECONDS) {
                setConnection(false, "Data kedaluwarsa");
                setCondition(
                    "Data kandang sudah lama",
                    "Belum ada pembacaan baru dalam 60 detik. Periksa ESP32 dan jaringan.",
                    "warn"
                );
                return;
            }
        } else {
            setText("farmLastUpdate", "Waktu pembaruan tidak tersedia.");
        }

        setConnection(true, "");

        if (!validTemperature || !validHumidity) {
            setCondition(
                "Data belum lengkap",
                "API belum memberikan nilai suhu dan kelembapan yang valid.",
                "warn"
            );
        } else if (
            temperature < TEMP_MIN || temperature > TEMP_MAX ||
            humidity < HUMIDITY_MIN || humidity > HUMIDITY_MAX
        ) {
            setCondition(
                "Perlu perhatian",
                "Suhu atau kelembapan berada di luar rentang indikator awal. Periksa kondisi kandang.",
                "bad"
            );
        } else {
            setCondition(
                "Dalam rentang indikator",
                "Pembacaan suhu dan kelembapan berada dalam rentang awal. Tetap sesuaikan dengan umur ayam.",
                "good"
            );
        }
    }

    async function refreshFarmCondition() {
        if (requestRunning) return;
        requestRunning = true;

        try {
            const response = await fetch(API_URL, {
                cache: "no-store",
                headers: { "Accept": "application/json" }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            // Mendukung format JSON yang membungkus data dengan "data"
            // maupun format yang langsung berisi pembacaan.
            const reading = result.data?.reading
                ?? result.data
                ?? result.reading
                ?? result.latest
                ?? result;

            const temperature = readValue(reading, ["temperature", "suhu"]);
            const humidity = readValue(reading, ["humidity", "kelembapan"]);

            if (temperature === null || humidity === null) {
                throw new Error("Data suhu/kelembapan tidak ditemukan pada respons API");
            }

            updateFromReading(reading);
        } catch (error) {
            setConnection(false, "Tidak dapat membaca data");
            setCondition(
                "Data sensor tidak tersedia",
                "Dashboard gagal mengambil pembacaan terbaru dari API. Periksa koneksi server dan endpoint.",
                "warn"
            );
            setText("farmLastUpdate", `Keterangan: ${error.message}`);
        } finally {
            requestRunning = false;
        }
    }

    refreshFarmCondition();
    window.setInterval(refreshFarmCondition, 5000);
})();
