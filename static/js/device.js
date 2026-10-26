const DEVICE_CODE = "ESP32-001";


async function loadDeviceInfo() {

    try {

        const response = await fetch(
            `/api/v1/devices/${DEVICE_CODE}`
        );

        const result = await response.json();

        if (!result.success) {
            console.error(result.message);
            return;
        }

        const device = result.data;


        setText(
            "deviceCode",
            device.device_code
        );

        setText(
            "deviceName",
            device.name
        );

        setText(
            "deviceStatus",
            device.status
        );

        setText(
            "deviceIP",
            device.ip_address || "-"
        );

        setText(
            "deviceLastSeen",
            device.last_seen || "-"
        );

    } catch (error) {

        console.error(
            "Gagal mengambil data device:",
            error
        );
    }
}


function setText(id, value) {

    const element =
        document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}


loadDeviceInfo();

setInterval(
    loadDeviceInfo,
    10000
);
