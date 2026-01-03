const mysql = require('mysql2/promise');
const { initDatabase } = require('./database');

async function resetDatabase() {
    console.log('🔄 Resetting database...');
    
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'system',
        database: 'sbk_portal'
    });
    
    // Drop all tables
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    await connection.execute('DROP TABLE IF EXISTS timetable');
    await connection.execute('DROP TABLE IF EXISTS marks');
    await connection.execute('DROP TABLE IF EXISTS attendance');
    await connection.execute('DROP TABLE IF EXISTS subjects');
    await connection.execute('DROP TABLE IF EXISTS users');
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log('🗑️ All data cleared');
    
    await connection.end();
    
    // Recreate tables
    await initDatabase();
    console.log('✅ Database reset complete!');
    process.exit(0);
}

resetDatabase();