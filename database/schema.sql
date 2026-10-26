CREATE DATABASE IF NOT EXISTS iot_ayam CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE iot_ayam;

CREATE TABLE IF NOT EXISTS devices (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_code VARCHAR(64) NOT NULL,
  device_name VARCHAR(120) NOT NULL,
  ip_address VARCHAR(45) NULL,
  firmware_version VARCHAR(80) NULL,
  status ENUM('online','offline') NOT NULL DEFAULT 'offline',
  last_seen DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_devices_code (device_code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id INT UNSIGNED NOT NULL,
  mode ENUM('AUTO','MANUAL') NOT NULL DEFAULT 'AUTO',
  temperature_threshold DECIMAL(5,2) NOT NULL DEFAULT 30.00,
  relay_state TINYINT(1) NOT NULL DEFAULT 0,
  auto_relay TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_settings_device (device_id),
  CONSTRAINT fk_settings_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sensor_readings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id INT UNSIGNED NOT NULL,
  temperature DECIMAL(5,2) NOT NULL,
  humidity DECIMAL(5,2) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_readings_device_time (device_id,recorded_at),
  CONSTRAINT fk_readings_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS commands (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id INT UNSIGNED NOT NULL,
  command_type ENUM('RELAY_ON','RELAY_OFF') NOT NULL,
  command_value VARCHAR(20) NOT NULL,
  status ENUM('pending','sent','completed','failed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  executed_at DATETIME NULL,
  PRIMARY KEY (id), KEY idx_commands_pending (device_id,status,id),
  CONSTRAINT fk_commands_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO devices (device_code,device_name,status)
VALUES ('ESP32-001','ESP32 DHT11','offline')
ON DUPLICATE KEY UPDATE device_name=VALUES(device_name);

INSERT INTO settings (device_id,mode,temperature_threshold,relay_state,auto_relay)
SELECT id,'AUTO',30.00,0,1 FROM devices WHERE device_code='ESP32-001'
ON DUPLICATE KEY UPDATE device_id=VALUES(device_id);
