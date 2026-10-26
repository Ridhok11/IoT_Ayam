// =====================================================
// DASHBOARD IoT DHT11
// Monitoring suhu, kelembapan, relay, dan status ESP32
// =====================================================

const DASHBOARD_API_BASE = "/api/v1";

const REFRESH_INTERVAL = 3000;
const DASHBOARD_OFFLINE_TIMEOUT = 15000;

let lastReceivedTime = null;
let sensorChart = null;


// =====================================================
// HELPER
// =====================================================

function getElement(id) {
    return document.getElementById(id);
}


function setText(id, value) {
    const element = getElement(id);

    if (element) {
        element.textContent = value;
    }
}


function extractData(response) {
    if (!response) {
        return null;
    }

    // Mendukung respons berbentuk:
    // {success: true, data: {...}}
    // atau objek data secara langsung.

    if (response.data !== undefined) {
        return response.data;
    }

    if (response.result !== undefined) {
        return response.result;
    }

    return response;
}


async function fetchJSON(url, options = {}) {
    const response = await fetch(url, {
        cache: "no-store",
        ...options
    });

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status} saat mengakses ${url}`
        );
    }

    return await response.json();
}


function formatDateTime(value) {
    if (!value) {
        return "--";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });
}


function isRelayOn(value) {
    return (
        value === true ||
        value === 1 ||
        value === "1" ||
        String(value).toUpperCase() === "ON" ||
        String(value).toUpperCase() === "TRUE"
    );
}


// =====================================================
// GRAFIK SENSOR
// =====================================================

function initializeChart() {
    const canvas = getElement("sensorChart");

    if (!canvas || typeof Chart === "undefined") {
        console.warn("Canvas grafik atau Chart.js tidak tersedia.");
        return;
    }

    sensorChart = new Chart(canvas, {
        type: "line",

        data: {
            labels: [],

            datasets: [
                {
                    label: "Suhu (°C)",
                    data: [],
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: "temperature"
                },

                {
                    label: "Kelembapan (%)",
                    data: [],
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: "humidity"
                }
            ]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            animation: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            scales: {
                temperature: {
                    type: "linear",
                    position: "left",

                    title: {
                        display: true,
                        text: "Suhu (°C)"
                    }
                },

                humidity: {
                    type: "linear",
                    position: "right",
                    min: 0,
                    max: 100,

                    title: {
                        display: true,
                        text: "Kelembapan (%)"
                    },

                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}


// =====================================================
// MEMPERBARUI GRAFIK DARI RIWAYAT SENSOR
// =====================================================

function updateChart(readings) {
    if (!sensorChart || !Array.isArray(readings)) {
        return;
    }

    // Urutkan data dari yang paling lama ke yang terbaru.
    const sortedReadings = [...readings].reverse();

    sensorChart.data.labels = sortedReadings.map(item => {
        if (!item.created_at) {
            return "--";
        }

        const date = new Date(item.created_at);

        if (Number.isNaN(date.getTime())) {
            return String(item.created_at);
        }

        return date.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        });
    });

    sensorChart.data.datasets[0].data =
        sortedReadings.map(item => Number(item.temperature));

    sensorChart.data.datasets[1].data =
        sortedReadings.map(item => Number(item.humidity));

    sensorChart.update("none");
}


// =====================================================
// MEMPERBARUI KARTU SUHU DAN KELEMBAPAN
// =====================================================

function updateSensorCards(reading) {
    if (!reading) {
        return;
    }

    const temperature = Number(reading.temperature);
    const humidity = Number(reading.humidity);

    if (Number.isFinite(temperature)) {
        setText("temperature", temperature.toFixed(1));

        if (temperature >= 35) {
            setText("temperatureStatus", "Suhu tinggi");
        } else if (temperature <= 20) {
            setText("temperatureStatus", "Suhu rendah");
        } else {
            setText("temperatureStatus", "Suhu normal");
        }
    }

    if (Number.isFinite(humidity)) {
        setText("humidity", humidity.toFixed(1));

        if (humidity > 80) {
            setText("humidityStatus", "Kelembapan tinggi");
        } else if (humidity < 30) {
            setText("humidityStatus", "Kelembapan rendah");
        } else {
            setText("humidityStatus", "Kelembapan terbaca");
        }
    }

    const relayOn = isRelayOn(reading.relay_status);
    const relayText = relayOn ? "ON" : "OFF";

    setText("relay", relayText);
    setText("deviceRelay", relayText);
    setText("relayStatus", "Status pembacaan terakhir");

    setText("lastUpdate", formatDateTime(reading.created_at));

    // Tentukan status berdasarkan waktu pembacaan sensor sebenarnya.
    const readingTime = new Date(
        String(reading.created_at || "").replace(" ", "T")
    ).getTime();

    const age = Date.now() - readingTime;

    const online =
        Number.isFinite(readingTime) &&
        age >= -60000 &&
        age <= DASHBOARD_OFFLINE_TIMEOUT;

    setText("deviceStatus", online ? "ONLINE" : "OFFLINE");
    setText("sensorStatus", online ? "AKTIF" : "TIDAK AKTIF");
}

// =====================================================
// MENGAMBIL DATA SENSOR TERBARU
// =====================================================

async function loadLatestReading() {
    try {
        const response = await fetchJSON(
            `${DASHBOARD_API_BASE}/readings/latest`
        );

        const reading = extractData(response);

        if (
            !reading ||
            reading.temperature === undefined ||
            reading.humidity === undefined
        ) {
            setText("sensorStatus", "Belum ada data");
            return;
        }

        updateSensorCards(reading);

    } catch (error) {
        console.error("Gagal mengambil data sensor:", error);

        setText("sensorStatus", "Gagal mengambil data");
    }
}


// =====================================================
// MENGAMBIL RIWAYAT SENSOR UNTUK GRAFIK
// =====================================================

async function loadSensorHistory() {
    try {
        const response = await fetchJSON(
            `${DASHBOARD_API_BASE}/readings/history`
        );

        const readings = extractData(response);

        if (Array.isArray(readings)) {
            updateChart(readings);
        } else if (
            readings &&
            Array.isArray(readings.readings)
        ) {
            updateChart(readings.readings);
        }

    } catch (error) {
        console.error("Gagal mengambil riwayat sensor:", error);
    }
}


// =====================================================
// MENGAMBIL PENGATURAN PERANGKAT
// =====================================================

async function loadDeviceSettings() {
    try {
        const response = await fetchJSON(
            `${DASHBOARD_API_BASE}/settings`
        );

        const settings = extractData(response);

        if (!settings || typeof settings !== "object") {
            return;
        }

        if (settings.temperature_threshold !== undefined) {
            setText(
                "threshold",
                Number(settings.temperature_threshold).toFixed(1)
            );
        }

        if (settings.mode !== undefined) {
            setText(
                "mode",
                String(settings.mode).toUpperCase()
            );
        }

    } catch (error) {
        console.error("Gagal mengambil pengaturan:", error);
    }
}


// =====================================================
// MEMERIKSA STATUS ESP32
// =====================================================

function checkDeviceStatus() {
    const lastUpdate = getElement("lastUpdate");

    if (!lastUpdate || lastUpdate.textContent === "--") {
        setText("deviceStatus", "OFFLINE");
        setText("sensorStatus", "Tidak ada data terbaru");
        return;
    }

    const latestTime = new Date(
        lastUpdate.textContent
    ).getTime();

    if (!Number.isFinite(latestTime)) {
        setText("deviceStatus", "OFFLINE");
        setText("sensorStatus", "Waktu data tidak valid");
        return;
    }

    const elapsed = Date.now() - latestTime;

    if (
        elapsed < -60000 ||
        elapsed > DASHBOARD_OFFLINE_TIMEOUT
    ) {
        setText("deviceStatus", "OFFLINE");
        setText("sensorStatus", "Tidak ada data terbaru");
        return;
    }

    setText("deviceStatus", "ONLINE");
    setText("sensorStatus", "AKTIF");
}

// =====================================================
// KONTROL RELAY
// =====================================================

async function setRelay(turnOn) {
    const relayStatus = turnOn ? 1 : 0;

    try {
        const response = await fetchJSON(
            `${DASHBOARD_API_BASE}/relay`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    relay_status: relayStatus
                })
            }
        );

        if (response.success === false) {
            throw new Error(
                response.message || "Perintah relay ditolak."
            );
        }

        alert(
            `Perintah relay ${turnOn ? "ON" : "OFF"} telah dikirim.`
        );

        await loadLatestReading();

    } catch (error) {
        console.error("Gagal mengontrol relay:", error);

        alert(
            "Kontrol relay gagal. Periksa endpoint Flask /api/v1/relay."
        );
    }
}


// =====================================================
// MEMULAI DASHBOARD
// =====================================================

async function refreshDashboard() {
    await Promise.all([
        loadLatestReading(),
        loadSensorHistory(),
        loadDeviceSettings()
    ]);

    checkDeviceStatus();
}


document.addEventListener("DOMContentLoaded", async function () {
    initializeChart();

    await refreshDashboard();

    // Perbarui data setiap 3 detik.
    setInterval(refreshDashboard, REFRESH_INTERVAL);

    // Periksa status perangkat setiap 3 detik.
    setInterval(checkDeviceStatus, REFRESH_INTERVAL);
});
