-- Add role column to users table for admin access control
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- Set admin role for the platform owner
UPDATE users SET role = 'admin' WHERE email = 'richardanjer@gmail.com';
