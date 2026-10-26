"use strict";

let temperatureChart = null;
let humidityChart = null;
let monitoringInterval = null;
let monitoringLoading = false;

const HISTORY_API = "/api/v1/readings/history?limit=50";

function formatTime(value) {
    if (!value) return "--";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}

function updateMonitoringInfo(reading) {
    if (!reading) {
        setText("monitorTemperature", "-- °C");
        setText("monitorHumidity", "-- %");
        setText("monitorRelay", "--");
        return;
    }

    const temperature = Number(reading.temperature);
    const humidity = Number(reading.humidity);

    setText(
        "monitorTemperature",
        Number.isFinite(temperature)
            ? `${temperature.toFixed(1)} °C`
            : "-- °C"
    );

    setText(
        "monitorHumidity",
        Number.isFinite(humidity)
            ? `${humidity.toFixed(1)} %`
            : "-- %"
    );

    if (reading.relay_status !== undefined &&
        reading.relay_status !== null) {
        const relayOn =
            reading.relay_status === true ||
            Number(reading.relay_status) === 1;

        setText("monitorRelay", relayOn ? "ON" : "OFF");
    } else {
        setText("monitorRelay", "Tidak tersedia");
    }
}

function createChart(canvasId, label, color, yAxisOptions) {
    const canvas = document.getElementById(canvasId);

    if (!canvas || typeof Chart === "undefined") {
        return null;
    }

    return new Chart(canvas.getContext("2d"), {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label,
                data: [],
                borderColor: color,
                backgroundColor: color + "22",
                borderWidth: 2,
                pointRadius: 2,
                pointHoverRadius: 5,
                tension: 0.3,
                fill: true,
                spanGaps: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                intersect: false,
                mode: "index"
            },
            plugins: {
                legend: {
                    display: true
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxTicksLimit: 8,
                        maxRotation: 0
                    }
                },
                y: yAxisOptions
            }
        }
    });
}

function initializeCharts() {
    if (typeof Chart === "undefined") {
        console.error(
            "Chart.js belum dimuat. Periksa script Chart.js di monitoring.html."
        );
        return;
    }

    if (!temperatureChart) {
        temperatureChart = createChart(
            "temperatureChart",
            "Suhu (°C)",
            "#e76f51",
            {
                beginAtZero: false,
                title: {
                    display: true,
                    text: "Suhu (°C)"
                }
            }
        );
    }

    if (!humidityChart) {
        humidityChart = createChart(
            "humidityChart",
            "Kelembapan (%)",
            "#2878b5",
            {
                beginAtZero: true,
                min: 0,
                max: 100,
                title: {
                    display: true,
                    text: "Kelembapan (%)"
                }
            }
        );
    }
}

function updateChart(chart, labels, values) {
    if (!chart) return;

    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.update("none");
}

function showMonitoringError(message) {
    let element = document.getElementById("monitoringError");

    if (!element) {
        element = document.createElement("p");
        element.id = "monitoringError";
        element.setAttribute("role", "status");
        element.style.marginTop = "12px";
        element.style.color = "#b42318";

        const container =
            document.querySelector(".monitoring-grid") ||
            document.querySelector(".page-header");

        if (container) {
            container.appendChild(element);
        }
    }

    element.textContent = message;
}

function clearMonitoringError() {
    const element = document.getElementById("monitoringError");

    if (element) {
        element.textContent = "";
    }
}

async function loadMonitoringData() {
    if (monitoringLoading) return;

    monitoringLoading = true;

    try {
        initializeCharts();

        const response = await fetch(HISTORY_API, {
            method: "GET",
            cache: "no-store",
            headers: {
                "Accept": "application/json"
            }
        });

        const result = await response.json();

        if (!response.ok || result.success === false) {
            throw new Error(
                result.message ||
                result.error ||
                `Permintaan gagal (${response.status})`
            );
        }

        const rows = Array.isArray(result.data)
            ? result.data
            : [];

        if (rows.length === 0) {
            updateMonitoringInfo(null);
            updateChart(temperatureChart, [], []);
            updateChart(humidityChart, [], []);
            showMonitoringError(
                "Belum ada data sensor dari ESP32 di riwayat."
            );
            return;
        }

        // API riwayat biasanya mengirim data terbaru terlebih dahulu.
        // Urutkan berdasarkan waktu agar grafik bergerak dari lama ke baru.
        const ordered = [...rows].sort((a, b) => {
            const timeA = new Date(
                a.created_at || a.recorded_at || 0
            ).getTime();

            const timeB = new Date(
                b.created_at || b.recorded_at || 0
            ).getTime();

            return timeA - timeB;
        });

        const labels = ordered.map(item =>
            formatTime(item.created_at || item.recorded_at)
        );

        const temperatures = ordered.map(item => {
            const value = Number(item.temperature);
            return Number.isFinite(value) ? value : null;
        });

        const humidities = ordered.map(item => {
            const value = Number(item.humidity);
            return Number.isFinite(value) ? value : null;
        });

        updateChart(temperatureChart, labels, temperatures);
        updateChart(humidityChart, labels, humidities);

        // Data terakhir dalam urutan kronologis adalah pembacaan terbaru.
        updateMonitoringInfo(ordered[ordered.length - 1]);

        clearMonitoringError();

    } catch (error) {
        console.error("Gagal mengambil data monitoring:", error);

        showMonitoringError(
            "Data monitoring gagal dimuat. Periksa koneksi server dan endpoint API."
        );
    } finally {
        monitoringLoading = false;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    initializeCharts();
    loadMonitoringData();

    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }

    // Memuat ulang data setiap 10 detik tanpa membuat ulang grafik.
    monitoringInterval = setInterval(loadMonitoringData, 10000);
});
