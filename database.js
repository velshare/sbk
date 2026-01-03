const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// Database configuration
const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'system', // Change this to your MySQL password
    database: 'sbk_portal'
};

let connection;

// Initialize database connection
async function initDatabase() {
    try {
        // Create connection without database first
        const tempConnection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });

        // Create database if it doesn't exist
        await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
        await tempConnection.end();

        // Connect to the database
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Database connected successfully');

        // Create tables
        await createTables();
        await createAdminUser();

        return connection;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.log('📝 Using in-memory storage instead');
        return null;
    }
}

// Create database tables
async function createTables() {
    try {
        // Users table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'faculty', 'student') NOT NULL,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL,
                className VARCHAR(50),
                rollNo VARCHAR(50),
                department ENUM('TAMIL', 'ENGLISH', 'MATHS', 'COMPUTER SCIENCE', 'INFORMATION TECHNOLOGY', 'BCA', 'CHEMISTRY', 'PHYSICAL EDUCATION', 'HISTORY', 'BCOM', 'BECOM CA'),
                joinYear VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Subjects table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS subjects (
                id INT AUTO_INCREMENT PRIMARY KEY,
                department ENUM('TAMIL', 'ENGLISH', 'MATHS', 'COMPUTER SCIENCE', 'INFORMATION TECHNOLOGY', 'BCA', 'CHEMISTRY', 'PHYSICAL EDUCATION', 'HISTORY', 'BCOM', 'BECOM CA') NOT NULL,
                joinYear VARCHAR(20) NOT NULL,
                subjectName VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_subject (department, joinYear, subjectName)
            )
        `);

        // Attendance table (subject-wise)
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                studentId VARCHAR(50) NOT NULL,
                subjectName VARCHAR(100) NOT NULL,
                date DATE NOT NULL,
                status ENUM('present', 'absent') NOT NULL,
                facultyId VARCHAR(50) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_attendance (studentId, subjectName, date),
                FOREIGN KEY (studentId) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (facultyId) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Marks table with exam types
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS marks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                studentId VARCHAR(50) NOT NULL,
                subjectName VARCHAR(100) NOT NULL,
                examType ENUM('internal1', 'internal2', 'semester') NOT NULL,
                marks INT NOT NULL,
                facultyId VARCHAR(50) NOT NULL,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_marks (studentId, subjectName, examType),
                FOREIGN KEY (studentId) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (facultyId) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Timetable table (7 hours: 9-10, 10-11, 11-12, 12-1, 2-3, 3-4, 4-5)
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS timetable (
                id INT AUTO_INCREMENT PRIMARY KEY,
                department ENUM('TAMIL', 'ENGLISH', 'MATHS', 'COMPUTER SCIENCE', 'INFORMATION TECHNOLOGY', 'BCA', 'CHEMISTRY', 'PHYSICAL EDUCATION', 'HISTORY', 'BCOM', 'BECOM CA') NOT NULL,
                joinYear VARCHAR(20) NOT NULL,
                dayOfWeek ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday') NOT NULL,
                timeSlot ENUM('9-10', '10-11', '11-12', '12-1', '2-3', '3-4', '4-5') NOT NULL,
                subjectName VARCHAR(100) NOT NULL,
                facultyId VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_slot (department, joinYear, dayOfWeek, timeSlot),
                FOREIGN KEY (facultyId) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        console.log('✅ Database tables created successfully');
    } catch (error) {
        console.error('❌ Error creating tables:', error.message);
    }
}

// Create default admin user
async function createAdminUser() {
    try {
        const [rows] = await connection.execute('SELECT * FROM users WHERE id = ? AND role = ?', ['admin', 'admin']);
        
        if (rows.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await connection.execute(
                'INSERT INTO users (id, password, role, name, email) VALUES (?, ?, ?, ?, ?)',
                ['admin', hashedPassword, 'admin', 'Administrator', 'admin@sbk.edu']
            );
            console.log('✅ Default admin user created');
        }
    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
    }
}

module.exports = { initDatabase, connection: () => connection };