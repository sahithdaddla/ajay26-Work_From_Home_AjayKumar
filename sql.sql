CREATE TABLE requests (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    employee_id VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    project VARCHAR(255) NOT NULL,
    manager VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);