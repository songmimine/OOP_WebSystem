CREATE DATABASE IF NOT EXISTS university_lablink
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE university_lablink;

CREATE TABLE IF NOT EXISTS roles (
  role_id VARCHAR(32) PRIMARY KEY,
  role_name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS accounts (
  account_id VARCHAR(32) PRIMARY KEY,
  role_id VARCHAR(32) NOT NULL,
  account_identifier VARCHAR(80) NOT NULL UNIQUE,
  university_email VARCHAR(160) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  department VARCHAR(120) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  account_status VARCHAR(16) NOT NULL DEFAULT 'Active',
  creation_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_accounts_role FOREIGN KEY (role_id) REFERENCES roles(role_id),
  CONSTRAINT chk_accounts_status CHECK (account_status IN ('Active', 'Inactive'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS equipment_categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(120) NOT NULL UNIQUE,
  category_description TEXT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS equipment (
  equipment_id VARCHAR(32) PRIMARY KEY,
  category_id INT NOT NULL,
  equipment_name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(160) NOT NULL DEFAULT '',
  unit VARCHAR(40) NOT NULL DEFAULT 'units',
  total_quantity INT NOT NULL,
  available_quantity INT NOT NULL,
  condition_status VARCHAR(40) NOT NULL DEFAULT 'Good',
  borrow_status VARCHAR(24) NOT NULL DEFAULT 'Available',
  equipment_status VARCHAR(16) NOT NULL DEFAULT 'Active',
  image_path VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_updated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_equipment_category FOREIGN KEY (category_id) REFERENCES equipment_categories(category_id),
  CONSTRAINT chk_equipment_total CHECK (total_quantity >= 0),
  CONSTRAINT chk_equipment_available CHECK (available_quantity >= 0 AND available_quantity <= total_quantity),
  CONSTRAINT chk_equipment_borrow_status CHECK (borrow_status IN ('Available', 'Unavailable')),
  CONSTRAINT chk_equipment_status CHECK (equipment_status IN ('Active', 'Inactive')),
  INDEX idx_equipment_category (category_id),
  INDEX idx_equipment_status (equipment_status, equipment_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS borrowing_requests (
  request_id VARCHAR(32) PRIMARY KEY,
  account_id VARCHAR(32) NOT NULL,
  purpose VARCHAR(500) NOT NULL,
  notes VARCHAR(2000) NOT NULL DEFAULT '',
  requested_borrowing_datetime DATETIME NOT NULL,
  requested_return_datetime DATETIME NOT NULL,
  request_status VARCHAR(16) NOT NULL DEFAULT 'Pending',
  reviewed_by VARCHAR(32),
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME,
  review_notes VARCHAR(2000) NOT NULL DEFAULT '',
  is_new TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_requests_account FOREIGN KEY (account_id) REFERENCES accounts(account_id),
  CONSTRAINT fk_requests_reviewer FOREIGN KEY (reviewed_by) REFERENCES accounts(account_id),
  CONSTRAINT chk_request_status CHECK (request_status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  INDEX idx_requests_status (request_status, submitted_at),
  INDEX idx_requests_account (account_id, submitted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS borrowing_request_items (
  request_item_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  request_id VARCHAR(32) NOT NULL,
  equipment_id VARCHAR(32) NOT NULL,
  requested_quantity INT NOT NULL,
  CONSTRAINT fk_request_items_request FOREIGN KEY (request_id) REFERENCES borrowing_requests(request_id) ON DELETE CASCADE,
  CONSTRAINT fk_request_items_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id),
  CONSTRAINT chk_requested_quantity CHECK (requested_quantity > 0),
  UNIQUE KEY uq_request_equipment (request_id, equipment_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS borrowing_transactions (
  transaction_id VARCHAR(32) PRIMARY KEY,
  request_id VARCHAR(32) NOT NULL UNIQUE,
  released_by VARCHAR(32) NOT NULL,
  release_datetime DATETIME NOT NULL,
  return_deadline DATETIME NOT NULL,
  actual_return_datetime DATETIME,
  return_requested_at DATETIME,
  transaction_status VARCHAR(24) NOT NULL DEFAULT 'Active',
  CONSTRAINT fk_transactions_request FOREIGN KEY (request_id) REFERENCES borrowing_requests(request_id),
  CONSTRAINT fk_transactions_releaser FOREIGN KEY (released_by) REFERENCES accounts(account_id),
  CONSTRAINT chk_transaction_status CHECK (transaction_status IN ('Active', 'Partially Returned', 'Returned', 'Overdue', 'Damaged', 'Lost')),
  INDEX idx_transactions_deadline (return_deadline, transaction_status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transaction_items (
  transaction_item_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transaction_id VARCHAR(32) NOT NULL,
  equipment_id VARCHAR(32) NOT NULL,
  quantity_borrowed INT NOT NULL,
  quantity_returned INT NOT NULL DEFAULT 0,
  quantity_lost INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_transaction_items_transaction FOREIGN KEY (transaction_id) REFERENCES borrowing_transactions(transaction_id),
  CONSTRAINT fk_transaction_items_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id),
  CONSTRAINT chk_quantity_borrowed CHECK (quantity_borrowed > 0),
  CONSTRAINT chk_quantity_returned CHECK (quantity_returned >= 0),
  CONSTRAINT chk_quantity_lost CHECK (quantity_lost >= 0),
  UNIQUE KEY uq_transaction_equipment (transaction_id, equipment_id),
  INDEX idx_transaction_items_equipment (equipment_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS extension_requests (
  extension_id VARCHAR(32) PRIMARY KEY,
  transaction_id VARCHAR(32) NOT NULL,
  account_id VARCHAR(32) NOT NULL,
  reviewed_by VARCHAR(32),
  reason TEXT NOT NULL,
  requested_new_due_date DATETIME NOT NULL,
  extension_status VARCHAR(16) NOT NULL DEFAULT 'Pending',
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME,
  CONSTRAINT fk_extensions_transaction FOREIGN KEY (transaction_id) REFERENCES borrowing_transactions(transaction_id),
  CONSTRAINT fk_extensions_account FOREIGN KEY (account_id) REFERENCES accounts(account_id),
  CONSTRAINT fk_extensions_reviewer FOREIGN KEY (reviewed_by) REFERENCES accounts(account_id),
  CONSTRAINT chk_extension_status CHECK (extension_status IN ('Pending', 'Approved', 'Rejected')),
  UNIQUE KEY uq_extension_transaction (transaction_id),
  INDEX idx_extensions_status (extension_status, submitted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS return_records (
  return_id VARCHAR(32) PRIMARY KEY,
  transaction_item_id BIGINT NOT NULL,
  inspected_by VARCHAR(32) NOT NULL,
  quantity_returned INT NOT NULL,
  actual_return_datetime DATETIME NOT NULL,
  condition_status VARCHAR(40) NOT NULL,
  inspection_notes TEXT NOT NULL,
  CONSTRAINT fk_returns_item FOREIGN KEY (transaction_item_id) REFERENCES transaction_items(transaction_item_id),
  CONSTRAINT fk_returns_inspector FOREIGN KEY (inspected_by) REFERENCES accounts(account_id),
  CONSTRAINT chk_return_quantity CHECK (quantity_returned > 0),
  INDEX idx_returns_item (transaction_item_id, actual_return_datetime)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS other_cases (
  case_id VARCHAR(32) PRIMARY KEY,
  transaction_item_id BIGINT NOT NULL,
  recorded_by VARCHAR(32) NOT NULL,
  case_type VARCHAR(32) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  date_recorded DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolution_status VARCHAR(24) NOT NULL DEFAULT 'Under Review',
  resolution_notes VARCHAR(2000) NOT NULL DEFAULT '',
  resolved_at DATETIME,
  overdue_case_item_id BIGINT GENERATED ALWAYS AS (
    CASE WHEN case_type = 'Overdue' THEN transaction_item_id ELSE NULL END
  ) STORED,
  CONSTRAINT fk_cases_item FOREIGN KEY (transaction_item_id) REFERENCES transaction_items(transaction_item_id),
  CONSTRAINT fk_cases_recorder FOREIGN KEY (recorded_by) REFERENCES accounts(account_id),
  CONSTRAINT chk_case_type CHECK (case_type IN ('Damaged', 'Lost', 'Overdue', 'Improper Return')),
  CONSTRAINT chk_case_quantity CHECK (quantity > 0),
  CONSTRAINT chk_case_resolution CHECK (resolution_status IN ('Under Review', 'Resolved')),
  INDEX idx_cases_status (resolution_status, date_recorded),
  UNIQUE KEY uq_overdue_case_item (overdue_case_item_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  setting_value TEXT NOT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO roles (role_id, role_name) VALUES
  ('user', 'User'),
  ('laboratory_staff', 'Laboratory Staff');
