-- PostgreSQL schema for MedKlinika (ordered for FK dependencies)

CREATE TABLE IF NOT EXISTS staff (
    id              SERIAL PRIMARY KEY,
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
    medflex_doctor_id TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'doctor' CHECK (role IN ('admin', 'doctor')),
    staff_id        INTEGER REFERENCES staff(id) ON DELETE SET NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,
    description     TEXT,
    price_from      NUMERIC(10,2),
    duration_min    INTEGER,
    medflex_service_id TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinic_info (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    name            TEXT NOT NULL,
    address         TEXT NOT NULL,
    phone           TEXT NOT NULL,
    email           TEXT,
    work_hours      TEXT,
    description     TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS consent_logs (
    id              SERIAL PRIMARY KEY,
    patient_name    TEXT,
    patient_phone   TEXT,
    patient_email   TEXT,
    consent_type    TEXT NOT NULL DEFAULT 'appointment',
    consent_text_version TEXT NOT NULL DEFAULT '1.0',
    ip_address      TEXT,
    user_agent      TEXT,
    accepted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_slots (
    id              SERIAL PRIMARY KEY,
    staff_id        INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    slot_date       DATE NOT NULL,
    slot_time       TIME NOT NULL,
    duration_min    INTEGER NOT NULL DEFAULT 30,
    status          TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'booked')),
    appointment_id  INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(staff_id, slot_date, slot_time)
);

CREATE TABLE IF NOT EXISTS appointments (
    id                       SERIAL PRIMARY KEY,
    staff_id                 INTEGER REFERENCES staff(id) ON DELETE SET NULL,
    service_id               INTEGER REFERENCES services(id) ON DELETE SET NULL,
    slot_id                  INTEGER,
    appointment_date         DATE NOT NULL,
    appointment_time         TIME NOT NULL,
    patient_name             TEXT NOT NULL,
    patient_phone            TEXT NOT NULL,
    patient_phone_normalized TEXT NOT NULL,
    patient_email            TEXT,
    comment                  TEXT,
    status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    payment_status           TEXT NOT NULL DEFAULT 'none'
                             CHECK (payment_status IN ('none', 'pending', 'paid', 'refunded')),
    medflex_external_id      TEXT,
    sync_status              TEXT NOT NULL DEFAULT 'local'
                             CHECK (sync_status IN ('local', 'pending', 'synced', 'failed')),
    consent_id               INTEGER REFERENCES consent_logs(id) ON DELETE SET NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE time_slots
    DROP CONSTRAINT IF EXISTS time_slots_appointment_id_fkey;
ALTER TABLE time_slots
    ADD CONSTRAINT time_slots_appointment_id_fkey
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;

ALTER TABLE appointments
    DROP CONSTRAINT IF EXISTS appointments_slot_id_fkey;
ALTER TABLE appointments
    ADD CONSTRAINT appointments_slot_id_fkey
    FOREIGN KEY (slot_id) REFERENCES time_slots(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS patient_records (
    id              SERIAL PRIMARY KEY,
    appointment_id  INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    staff_id        INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    record_type     TEXT NOT NULL DEFAULT 'note'
                    CHECK (record_type IN ('note', 'procedure', 'result', 'diagnosis')),
    title           TEXT,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_files (
    id              SERIAL PRIMARY KEY,
    appointment_id  INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    staff_id        INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    original_name   TEXT NOT NULL,
    stored_name     TEXT NOT NULL,
    mime_type       TEXT,
    file_size       INTEGER,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_data_audit (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    staff_id        INTEGER REFERENCES staff(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       INTEGER,
    ip_address      TEXT,
    details         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_queue (
    id              SERIAL PRIMARY KEY,
    appointment_id  INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
    channel         TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
    recipient       TEXT NOT NULL,
    subject         TEXT,
    body            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed')),
    error_message   TEXT,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
    id              SERIAL PRIMARY KEY,
    appointment_id  INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    amount          NUMERIC(10,2) NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'RUB',
    yookassa_payment_id TEXT UNIQUE,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'waiting_for_capture', 'succeeded', 'canceled')),
    confirmation_url TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_sync_log (
    id              SERIAL PRIMARY KEY,
    integration     TEXT NOT NULL CHECK (integration IN ('medflex', 'medlock', '1c')),
    direction       TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
    entity_type     TEXT NOT NULL,
    entity_id       INTEGER,
    external_id     TEXT,
    status          TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
    request_payload JSONB,
    response_payload JSONB,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(patient_phone_normalized);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_slots_staff_date ON time_slots(staff_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_payments_appointment ON payments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_integration ON integration_sync_log(integration, created_at);
