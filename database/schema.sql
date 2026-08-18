-- Схема базы данных медицинского центра «МедКлиника на Гагарина»

PRAGMA foreign_keys = ON;

-- Учётные записи сотрудников (администрация и врачи)
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'doctor'
                    CHECK (role IN ('admin', 'doctor')),
    staff_id        INTEGER,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_staff ON users(staff_id);

-- Медицинский персонал
CREATE TABLE IF NOT EXISTS staff (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    middle_name     TEXT,
    specialty       TEXT NOT NULL,
    position        TEXT NOT NULL DEFAULT 'врач',
    qualification   TEXT,
    experience_years INTEGER DEFAULT 0,
    education       TEXT,
    photo_url       TEXT,
    description     TEXT,
    schedule        TEXT,
    phone           TEXT,
    email           TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_staff_specialty ON staff(specialty);
CREATE INDEX IF NOT EXISTS idx_staff_active ON staff(is_active);

-- Услуги медицинского центра
CREATE TABLE IF NOT EXISTS services (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,
    description     TEXT,
    price_from      REAL,
    duration_min    INTEGER,
    is_active       INTEGER NOT NULL DEFAULT 1,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);

-- Записи на приём
CREATE TABLE IF NOT EXISTS appointments (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id                 INTEGER,
    service_id               INTEGER,
    slot_id                  INTEGER,
    appointment_date         TEXT NOT NULL,
    appointment_time         TEXT NOT NULL,
    patient_name             TEXT NOT NULL,
    patient_phone            TEXT NOT NULL,
    patient_phone_normalized TEXT NOT NULL,
    comment                  TEXT,
    status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
    FOREIGN KEY (slot_id) REFERENCES time_slots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_staff ON appointments(staff_id);
CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(patient_phone_normalized);

-- Окна приёма врача
CREATE TABLE IF NOT EXISTS time_slots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id        INTEGER NOT NULL,
    slot_date       TEXT NOT NULL,
    slot_time       TEXT NOT NULL,
    duration_min    INTEGER NOT NULL DEFAULT 30,
    status          TEXT NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available', 'booked')),
    appointment_id  INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
    UNIQUE(staff_id, slot_date, slot_time)
);

CREATE INDEX IF NOT EXISTS idx_slots_staff_date ON time_slots(staff_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_slots_status ON time_slots(status);

-- Медицинские записи по приёму (заметки врача)
CREATE TABLE IF NOT EXISTS patient_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id  INTEGER NOT NULL,
    staff_id        INTEGER NOT NULL,
    record_type     TEXT NOT NULL DEFAULT 'note'
                    CHECK (record_type IN ('note', 'procedure', 'result', 'diagnosis')),
    title           TEXT,
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_records_appointment ON patient_records(appointment_id);

-- Файлы к приёму (результаты, документы)
CREATE TABLE IF NOT EXISTS patient_files (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id  INTEGER NOT NULL,
    staff_id        INTEGER NOT NULL,
    original_name   TEXT NOT NULL,
    stored_name     TEXT NOT NULL,
    mime_type       TEXT,
    file_size       INTEGER,
    description     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_files_appointment ON patient_files(appointment_id);

-- Информация о клинике
CREATE TABLE IF NOT EXISTS clinic_info (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    name            TEXT NOT NULL,
    address         TEXT NOT NULL,
    phone           TEXT NOT NULL,
    email           TEXT,
    work_hours      TEXT,
    description     TEXT,
    latitude        REAL,
    longitude       REAL
);

-- 152-FZ
CREATE TABLE IF NOT EXISTS consent_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_name    TEXT,
    patient_phone   TEXT,
    patient_email   TEXT,
    consent_type    TEXT NOT NULL DEFAULT 'appointment',
    consent_text_version TEXT NOT NULL DEFAULT '1.0',
    ip_address      TEXT,
    user_agent      TEXT,
    accepted_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS personal_data_audit (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER,
    staff_id        INTEGER,
    action          TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       INTEGER,
    ip_address      TEXT,
    details         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_queue (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id  INTEGER,
    channel         TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
    recipient       TEXT NOT NULL,
    subject         TEXT,
    body            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    error_message   TEXT,
    sent_at         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id  INTEGER NOT NULL,
    amount          REAL NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'RUB',
    yookassa_payment_id TEXT UNIQUE,
    status          TEXT NOT NULL DEFAULT 'pending',
    confirmation_url TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integration_sync_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    integration     TEXT NOT NULL,
    direction       TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       INTEGER,
    external_id     TEXT,
    status          TEXT NOT NULL,
    request_payload TEXT,
    response_payload TEXT,
    error_message   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
