import os
import csv
import io
import logging

import pymysql
from dotenv import load_dotenv
from flask import (
    Flask, Blueprint, render_template, request,
    jsonify, Response
)

# ==================================================
# KONFIGURASI
# ==================================================

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv(
    "SECRET_KEY",
    "kunci-rahasia-iot-2026"
)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_NAME = os.getenv("DB_NAME", "iot_ayam")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

ESP32_API_KEY = os.getenv(
    "ESP32_API_KEY",
    "esp32-rahasia-2026"
)

logging.basicConfig(level=logging.INFO)

# Blueprint agar sesuai dengan template yang memakai
# url_for('web.dashboard'), url_for('web.monitoring'), dll.
web_bp = Blueprint("web", __name__)
api_bp = Blueprint("api", __name__, url_prefix="/api/v1")


# ==================================================
# KONEKSI DATABASE
# ==================================================

def get_db():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
        connect_timeout=5
    )


def fetch_one(query, params=()):
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchone()
    finally:
        conn.close()


def fetch_all(query, params=()):
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall()
    finally:
        conn.close()


def execute_query(query, params=()):
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.lastrowid
    finally:
        conn.close()


def serialize_row(row):
    """Ubah nilai datetime agar bisa dikirim sebagai JSON."""
    if row and row.get("created_at"):
        row["created_at"] = row["created_at"].isoformat(
            timespec="seconds"
        )
    if row and row.get("updated_at"):
        row["updated_at"] = row["updated_at"].isoformat(
            timespec="seconds"
        )
    return row


def get_latest_reading():
    return fetch_one("""
        SELECT id, temperature, humidity, relay_status, created_at
        FROM sensor_readings
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    """)


def get_settings():
    return fetch_one("""
        SELECT id, mode, manual_relay,
               temperature_threshold, updated_at
        FROM device_settings
        ORDER BY id ASC
        LIMIT 1
    """)


def get_history(limit=100):
    limit = max(1, min(int(limit), 500))
    return fetch_all("""
        SELECT id, temperature, humidity, relay_status, created_at
        FROM sensor_readings
        ORDER BY created_at DESC, id DESC
        LIMIT %s
    """, (limit,))


# ==================================================
# HALAMAN WEBSITE
# ==================================================

@web_bp.route("/")
@web_bp.route("/dashboard")
def dashboard():
    try:
        latest = get_latest_reading()
        settings = get_settings()
        history = get_history(20)

        return render_template(
            "dashboard.html",
            latest=latest,
            settings=settings,
            history=history
        )
    except Exception:
        app.logger.exception("Dashboard gagal dimuat")
        return (
            "Gagal memuat dashboard. Periksa terminal Flask "
            "untuk melihat penyebab error.",
            500
        )


@web_bp.route("/monitoring")
def monitoring():
    try:
        latest = get_latest_reading()
        settings = get_settings()
        history = get_history(100)

        return render_template(
            "monitoring.html",
            latest=latest,
            settings=settings,
            history=history
        )
    except Exception:
        app.logger.exception("Monitoring gagal dimuat")
        return "Gagal memuat monitoring. Periksa terminal Flask.", 500


@web_bp.route("/settings", methods=["GET", "POST"])
def settings():
    try:
        current = get_settings()

        if request.method == "POST":
            mode = request.form.get("mode", "AUTO")
            threshold = float(
                request.form.get("temperature_threshold", 25)
            )
            relay = int(request.form.get("manual_relay", 0))

            if mode not in ("AUTO", "MANUAL"):
                return "Mode tidak valid.", 400

            if not -40 <= threshold <= 80:
                return "Batas suhu tidak valid.", 400

            if relay not in (0, 1):
                return "Status relay tidak valid.", 400

            if current is None:
                execute_query("""
                    INSERT INTO device_settings
                        (mode, manual_relay, temperature_threshold)
                    VALUES (%s, %s, %s)
                """, (mode, relay, threshold))
            else:
                execute_query("""
                    UPDATE device_settings
                    SET mode=%s,
                        manual_relay=%s,
                        temperature_threshold=%s
                    WHERE id=%s
                """, (
                    mode, relay, threshold, current["id"]
                ))

            current = get_settings()

        return render_template(
            "settings.html",
            settings=current
        )
    except Exception:
        app.logger.exception("Pengaturan gagal dimuat")
        return "Gagal memuat pengaturan. Periksa terminal Flask.", 500


@web_bp.route("/history")
def history_page():
    try:
        history = get_history(100)

        return render_template(
            "history.html",
            history=history
        )
    except Exception:
        app.logger.exception("Riwayat gagal dimuat")
        return "Gagal memuat riwayat. Periksa terminal Flask.", 500


@web_bp.route("/history/export.csv")
def export_history_csv():
    try:
        rows = get_history(500)

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            "ID", "Suhu (C)", "Kelembapan (%)",
            "Status Relay", "Waktu"
        ])

        for row in rows:
            writer.writerow([
                row["id"],
                row["temperature"],
                row["humidity"],
                row["relay_status"],
                row["created_at"]
            ])

        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={
                "Content-Disposition":
                    "attachment; filename=riwayat_sensor.csv"
            }
        )
    except Exception:
        app.logger.exception("Ekspor CSV gagal")
        return "Gagal mengekspor riwayat.", 500


@web_bp.route("/device")
def device_page():
    try:
        latest = get_latest_reading()
        settings = get_settings()

        return render_template(
            "device.html",
            latest=latest,
            settings=settings,
            devices=[]
        )
    except Exception:
        app.logger.exception("Halaman perangkat gagal dimuat")
        return "Gagal memuat halaman perangkat.", 500


@web_bp.route("/about")
def about_page():
    return render_template("about.html")


# ==================================================
# API: STATUS SERVER DAN DATABASE
# ==================================================

@api_bp.route("/health", methods=["GET"])
def api_health():
    try:
        result = fetch_one("SELECT 1 AS database_ok")

        return jsonify({
            "success": True,
            "application": "IoT DHT11",
            "database": "connected",
            "result": result
        })
    except Exception as error:
        app.logger.exception("Pemeriksaan database gagal")

        return jsonify({
            "success": False,
            "database": "disconnected",
            "error": str(error)
        }), 500


# ==================================================
# API: ESP32 MENGIRIM DATA SENSOR
# ==================================================

@api_bp.route("/readings", methods=["POST"])
def receive_reading():
    api_key = request.headers.get("X-API-Key", "")

    if api_key != ESP32_API_KEY:
        return jsonify({
            "success": False,
            "message": "API key salah"
        }), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "Kirim data dalam format JSON"
        }), 400

    try:
        temperature = float(data["temperature"])
        humidity = float(data["humidity"])
        relay_status = int(data.get("relay_status", 0))

        if not -40 <= temperature <= 80:
            raise ValueError("Suhu di luar rentang yang diizinkan")

        if not 0 <= humidity <= 100:
            raise ValueError("Kelembapan harus 0 sampai 100")

        if relay_status not in (0, 1):
            raise ValueError("relay_status harus 0 atau 1")

    except (KeyError, TypeError, ValueError) as error:
        return jsonify({
            "success": False,
            "message": f"Data tidak valid: {error}"
        }), 400

    try:
        execute_query("""
            INSERT INTO sensor_readings
                (temperature, humidity, relay_status)
            VALUES (%s, %s, %s)
        """, (temperature, humidity, relay_status))

        return jsonify({
            "success": True,
            "message": "Data sensor berhasil disimpan",
            "data": {
                "temperature": temperature,
                "humidity": humidity,
                "relay_status": relay_status
            }
        }), 201

    except Exception as error:
        app.logger.exception("Gagal menyimpan data sensor")

        return jsonify({
            "success": False,
            "message": "Gagal menyimpan data ke database",
            "error": str(error)
        }), 500


# ==================================================
# API: DATA SENSOR TERBARU
# ==================================================

@api_bp.route("/readings/latest", methods=["GET"])
def api_latest_reading():
    try:
        reading = get_latest_reading()

        return jsonify({
            "success": True,
            "data": serialize_row(reading)
        })
    except Exception as error:
        app.logger.exception("Gagal membaca data terbaru")

        return jsonify({
            "success": False,
            "error": str(error)
        }), 500


# ==================================================
# API: RIWAYAT SENSOR
# ==================================================

@api_bp.route("/readings/history", methods=["GET"])
def api_reading_history():
    try:
        limit = request.args.get("limit", default=20, type=int)
        rows = get_history(limit)

        for row in rows:
            serialize_row(row)

        return jsonify({
            "success": True,
            "count": len(rows),
            "data": rows
        })
    except Exception as error:
        app.logger.exception("Gagal membaca riwayat")

        return jsonify({
            "success": False,
            "error": str(error)
        }), 500


# ==================================================
# API: MEMBACA DAN MENGUBAH PENGATURAN
# ==================================================

@api_bp.route("/settings", methods=["GET"])
def api_get_settings():
    try:
        settings_data = get_settings()

        if settings_data is None:
            return jsonify({
                "success": False,
                "message": "Pengaturan belum tersedia"
            }), 404

        serialize_row(settings_data)

        return jsonify({
            "success": True,
            "data": settings_data
        })
    except Exception as error:
        app.logger.exception("Gagal membaca pengaturan")

        return jsonify({
            "success": False,
            "error": str(error)
        }), 500


@api_bp.route("/settings", methods=["PUT"])
def api_update_settings():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "Body harus berupa JSON"
        }), 400

    mode = data.get("mode")
    threshold = data.get("temperature_threshold")

    if mode not in ("AUTO", "MANUAL"):
        return jsonify({
            "success": False,
            "message": "Mode harus AUTO atau MANUAL"
        }), 400

    try:
        threshold = float(threshold)

        if not -40 <= threshold <= 80:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "message": "Batas suhu tidak valid"
        }), 400

    try:
        current = get_settings()

        if current is None:
            execute_query("""
                INSERT INTO device_settings
                    (mode, manual_relay, temperature_threshold)
                VALUES (%s, 0, %s)
            """, (mode, threshold))
        else:
            execute_query("""
                UPDATE device_settings
                SET mode=%s, temperature_threshold=%s
                WHERE id=%s
            """, (mode, threshold, current["id"]))

        return jsonify({
            "success": True,
            "message": "Pengaturan berhasil diperbarui"
        })
    except Exception as error:
        app.logger.exception("Gagal memperbarui pengaturan")

        return jsonify({
            "success": False,
            "error": str(error)
        }), 500


# ==================================================
# API: KONTROL RELAY MANUAL
# ==================================================

@api_bp.route("/relay", methods=["POST"])
def api_update_relay():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "Body harus berupa JSON"
        }), 400

    try:
        relay = int(data["relay_status"])

        if relay not in (0, 1):
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        return jsonify({
            "success": False,
            "message": "relay_status harus 0 atau 1"
        }), 400

    try:
        current = get_settings()

        if current is None:
            execute_query("""
                INSERT INTO device_settings
                    (mode, manual_relay, temperature_threshold)
                VALUES ('MANUAL', %s, 25)
            """, (relay,))
        else:
            execute_query("""
                UPDATE device_settings
                SET mode='MANUAL', manual_relay=%s
                WHERE id=%s
            """, (relay, current["id"]))

        return jsonify({
            "success": True,
            "message": "Pengaturan relay berhasil disimpan",
            "relay_status": relay
        })
    except Exception as error:
        app.logger.exception("Gagal mengubah relay")

        return jsonify({
            "success": False,
            "error": str(error)
        }), 500


# ==================================================
# DAFTARKAN ROUTE
# ==================================================

app.register_blueprint(web_bp)
app.register_blueprint(api_bp)


# ==================================================
# JALANKAN SERVER
# ==================================================

if __name__ == "__main__":
    print("=" * 50)
    print("       WEB IOT DHT11")
    print("       http://127.0.0.1:5000")
    print("=" * 50)

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )
