const express = require('express');
const bcrypt = require('bcryptjs');
const { initDatabase, connection } = require('./database');

const app = express();

app.use(express.json());
app.use(express.static('.'));

// In-memory fallback storage
const fallbackUsers = {
    admin: [{ id: 'admin', password: 'admin123', name: 'Administrator', email: 'admin@sbk.edu' }],
    faculty: [],
    student: []
};
const fallbackAttendance = [];
const fallbackMarks = [];

let db = null;
let useDatabase = false;

// Initialize database
async function startServer() {
    db = await initDatabase();
    useDatabase = db !== null;
    
    if (!useDatabase) {
        console.log('📝 Running with in-memory storage');
    }
}

// Simple session storage for demo
const sessions = {};

// Login endpoint
app.post('/login', async (req, res) => {
    const { id, password, role } = req.body;
    console.log('Login attempt:', { id, role });

    try {
        if (useDatabase) {
            const [rows] = await db.execute('SELECT * FROM users WHERE id = ? AND role = ?', [id, role]);
            
            if (rows.length > 0) {
                const user = rows[0];
                const isValidPassword = await bcrypt.compare(password, user.password);
                
                if (isValidPassword) {
                    // Store session for faculty
                    if (role === 'faculty') {
                        sessions[id] = { id: user.id, name: user.name, role };
                    }
                    
                    console.log('✅ Database login successful for:', id);
                    return res.json({
                        success: true,
                        role,
                        user: { id: user.id, name: user.name, className: user.className, rollNo: user.rollNo },
                        redirect: `/${role}.html`
                    });
                }
            }
        } else {
            // Fallback to in-memory
            const user = fallbackUsers[role].find(u => u.id === id && u.password === password);
            if (user) {
                // Store session for faculty
                if (role === 'faculty') {
                    sessions[id] = { id: user.id, name: user.name, role };
                }
                
                console.log('✅ In-memory login successful for:', id);
                return res.json({
                    success: true,
                    role,
                    user: { id: user.id, name: user.name, className: user.className, rollNo: user.rollNo },
                    redirect: `/${role}.html`
                });
            }
        }

        console.log('❌ Login failed for:', id);
        res.json({ success: false, message: 'Invalid credentials' });
    } catch (error) {
        console.error('Login error:', error);
        res.json({ success: false, message: 'Server error' });
    }
});

// Admin endpoints
app.post('/admin/bulk-create-students', async (req, res) => {
    const { students } = req.body;
    let created = 0;
    let failed = 0;
    const errors = [];
    
    for (const student of students) {
        try {
            const { id, password, name, email, className, rollNo, department, startYear } = student;
            
            // Calculate 3-year range
            let joinYear = null;
            if (startYear) {
                const endYear = parseInt(startYear) + 3;
                joinYear = `${startYear}-${endYear}`;
            }
            
            if (useDatabase) {
                // Check if user exists
                const [existing] = await db.execute('SELECT id FROM users WHERE id = ?', [id]);
                if (existing.length > 0) {
                    errors.push(`${id}: User already exists`);
                    failed++;
                    continue;
                }
                
                const hashedPassword = await bcrypt.hash(password, 10);
                await db.execute(
                    'INSERT INTO users (id, password, role, name, email, className, rollNo, department, joinYear) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [id, hashedPassword, 'student', name, email, className || null, rollNo || null, department || null, joinYear]
                );
            } else {
                // Fallback to in-memory
                if (fallbackUsers.student.find(u => u.id === id)) {
                    errors.push(`${id}: User already exists`);
                    failed++;
                    continue;
                }
                
                fallbackUsers.student.push({
                    id, password, name, email, className, rollNo, department, joinYear
                });
            }
            
            created++;
        } catch (error) {
            errors.push(`${student.id}: ${error.message}`);
            failed++;
        }
    }
    
    res.json({
        success: true,
        message: `Bulk upload completed`,
        created,
        failed,
        errors: errors.slice(0, 10) // Show first 10 errors
    });
});

app.post('/admin/create-user', async (req, res) => {
    const { role, id, password, name, email, className, rollNo, department, startYear } = req.body;
    
    // Calculate 3-year range for students
    let joinYear = null;
    if (role === 'student' && startYear) {
        const endYear = parseInt(startYear) + 3;
        joinYear = `${startYear}-${endYear}`;
    }

    try {
        if (useDatabase) {
            // Check if user exists
            const [existing] = await db.execute('SELECT id FROM users WHERE id = ?', [id]);
            if (existing.length > 0) {
                return res.json({ success: false, message: 'User ID already exists' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            await db.execute(
                'INSERT INTO users (id, password, role, name, email, className, rollNo, department, joinYear) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, hashedPassword, role, name, email, className || null, rollNo || null, department || null, joinYear || null]
            );
        } else {
            // Fallback to in-memory
            if (fallbackUsers[role].find(u => u.id === id)) {
                return res.json({ success: false, message: 'User ID already exists' });
            }

            const newUser = { id, password, name, email };
            if (role === 'student') {
                newUser.className = className;
                newUser.rollNo = rollNo;
                newUser.department = department;
                newUser.joinYear = joinYear;
            }
            fallbackUsers[role].push(newUser);
        }

        res.json({ success: true, message: `${role} created successfully` });
    } catch (error) {
        console.error('Create user error:', error);
        res.json({ success: false, message: 'Error creating user' });
    }
});

app.get('/admin/users/:role', async (req, res) => {
    try {
        if (useDatabase) {
            const [rows] = await db.execute('SELECT id, name, email, className, rollNo, department, joinYear FROM users WHERE role = ?', [req.params.role]);
            res.json(rows);
        } else {
            res.json(fallbackUsers[req.params.role] || []);
        }
    } catch (error) {
        console.error('Get users error:', error);
        res.json([]);
    }
});

app.get('/admin/department-years/:department', async (req, res) => {
    try {
        if (useDatabase) {
            const [rows] = await db.execute('SELECT DISTINCT joinYear FROM users WHERE department = ? AND role = "student"', [req.params.department]);
            res.json(rows.map(r => r.joinYear));
        } else {
            const years = [...new Set(fallbackUsers.student.filter(s => s.department === req.params.department).map(s => s.joinYear))];
            res.json(years);
        }
    } catch (error) {
        res.json([]);
    }
});

app.post('/admin/add-subject', async (req, res) => {
    const { department, joinYear, subjectName } = req.body;
    try {
        if (useDatabase) {
            await db.execute('INSERT INTO subjects (department, joinYear, subjectName) VALUES (?, ?, ?)', [department, joinYear, subjectName]);
        }
        res.json({ success: true, message: 'Subject added successfully' });
    } catch (error) {
        res.json({ success: false, message: 'Subject already exists or error occurred' });
    }
});

app.get('/admin/subjects/:department/:year', async (req, res) => {
    try {
        if (useDatabase) {
            const [rows] = await db.execute('SELECT * FROM subjects WHERE department = ? AND joinYear = ?', [req.params.department, req.params.year]);
            res.json(rows);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.json([]);
    }
});

app.post('/admin/add-timetable', async (req, res) => {
    const { department, joinYear, dayOfWeek, timeSlot, subjectName, facultyId } = req.body;
    try {
        if (useDatabase) {
            await db.execute(
                'INSERT INTO timetable (department, joinYear, dayOfWeek, timeSlot, subjectName, facultyId) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE subjectName = ?, facultyId = ?',
                [department, joinYear, dayOfWeek, timeSlot, subjectName, facultyId, subjectName, facultyId]
            );
        }
        res.json({ success: true, message: 'Timetable updated successfully' });
    } catch (error) {
        res.json({ success: false, message: 'Error updating timetable' });
    }
});

// Faculty endpoints
app.get('/faculty/assigned-subjects', async (req, res) => {
    try {
        // Get faculty ID from query parameter or use first available faculty for demo
        let facultyId = req.query.facultyId;
        
        if (!facultyId) {
            // For demo purposes, get the first faculty ID from database
            if (useDatabase) {
                const [facultyRows] = await db.execute('SELECT id FROM users WHERE role = "faculty" LIMIT 1');
                if (facultyRows.length > 0) {
                    facultyId = facultyRows[0].id;
                }
            } else {
                if (fallbackUsers.faculty.length > 0) {
                    facultyId = fallbackUsers.faculty[0].id;
                }
            }
        }
        
        if (!facultyId) {
            return res.json([]);
        }
        
        if (useDatabase) {
            const [rows] = await db.execute(
                'SELECT DISTINCT department, joinYear, subjectName FROM timetable WHERE facultyId = ?',
                [facultyId]
            );
            res.json(rows);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('Get assigned subjects error:', error);
        res.json([]);
    }
});

app.get('/faculty/students/:department/:year', async (req, res) => {
    try {
        if (useDatabase) {
            const [rows] = await db.execute(
                'SELECT id, name, className, rollNo FROM users WHERE role = "student" AND department = ? AND joinYear = ?',
                [req.params.department, req.params.year]
            );
            res.json(rows);
        } else {
            const students = fallbackUsers.student.filter(s => 
                s.department === req.params.department && s.joinYear === req.params.year
            );
            res.json(students);
        }
    } catch (error) {
        res.json([]);
    }
});

app.post('/faculty/attendance', async (req, res) => {
    const { studentId, subjectName, date, status } = req.body;
    const facultyId = req.query.facultyId || req.headers['faculty-id'] || 'FAC001';

    try {
        if (useDatabase) {
            await db.execute(
                'INSERT INTO attendance (studentId, subjectName, date, status, facultyId) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = ?',
                [studentId, subjectName, date, status, facultyId, status]
            );
        } else {
            const existingIndex = fallbackAttendance.findIndex(a => 
                a.studentId === studentId && a.subjectName === subjectName && a.date === date
            );
            if (existingIndex !== -1) {
                fallbackAttendance[existingIndex].status = status;
            } else {
                fallbackAttendance.push({ studentId, subjectName, date, status, facultyId, timestamp: new Date() });
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Attendance error:', error);
        res.json({ success: false, message: 'Error marking attendance' });
    }
});

app.post('/faculty/marks', async (req, res) => {
    const { studentId, subjectName, examType, marks } = req.body;
    const facultyId = req.query.facultyId || req.headers['faculty-id'] || 'FAC001';

    try {
        if (useDatabase) {
            await db.execute(
                'INSERT INTO marks (studentId, subjectName, examType, marks, facultyId) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE marks = ?',
                [studentId, subjectName, examType, marks, facultyId, marks]
            );
        } else {
            const existingIndex = fallbackMarks.findIndex(m => 
                m.studentId === studentId && m.subjectName === subjectName && m.examType === examType
            );
            if (existingIndex !== -1) {
                fallbackMarks[existingIndex].marks = marks;
            } else {
                fallbackMarks.push({ studentId, subjectName, examType, marks, facultyId, date: new Date() });
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Marks error:', error);
        res.json({ success: false, message: 'Error adding marks' });
    }
});

app.get('/faculty/students', async (req, res) => {
    try {
        if (useDatabase) {
            const [rows] = await db.execute('SELECT id, name, className, rollNo FROM users WHERE role = ?', ['student']);
            res.json(rows);
        } else {
            res.json(fallbackUsers.student);
        }
    } catch (error) {
        console.error('Get students error:', error);
        res.json([]);
    }
});

// Check if attendance already exists
app.get('/faculty/check-attendance', async (req, res) => {
    try {
        const { studentId, subjectName, date, facultyId } = req.query;
        
        if (useDatabase) {
            const [rows] = await db.execute(
                'SELECT id FROM attendance WHERE studentId = ? AND subjectName = ? AND date = ?',
                [studentId, subjectName, date]
            );
            res.json({ hasAttendance: rows.length > 0 });
        } else {
            const exists = fallbackAttendance.some(a => 
                a.studentId === studentId && a.subjectName === subjectName && a.date === date
            );
            res.json({ hasAttendance: exists });
        }
    } catch (error) {
        console.error('Check attendance error:', error);
        res.json({ hasAttendance: false });
    }
});

// Get subjects where faculty has added marks
app.get('/faculty/marks-subjects', async (req, res) => {
    try {
        const facultyId = req.query.facultyId;
        
        if (!facultyId) {
            return res.json([]);
        }
        
        if (useDatabase) {
            const [rows] = await db.execute(
                'SELECT DISTINCT subjectName FROM marks WHERE facultyId = ? ORDER BY subjectName',
                [facultyId]
            );
            res.json(rows.map(r => r.subjectName));
        } else {
            const subjects = [...new Set(fallbackMarks.filter(m => m.facultyId === facultyId).map(m => m.subjectName))];
            res.json(subjects);
        }
    } catch (error) {
        console.error('Get faculty marks subjects error:', error);
        res.json([]);
    }
});

// Get student timetable
app.get('/student/:id/timetable', async (req, res) => {
    try {
        if (useDatabase) {
            // Get student details first
            const [studentRows] = await db.execute('SELECT department, joinYear FROM users WHERE id = ? AND role = "student"', [req.params.id]);
            
            if (studentRows.length === 0) {
                return res.json([]);
            }
            
            const { department, joinYear } = studentRows[0];
            
            // Get timetable with faculty names
            const [timetableRows] = await db.execute(`
                SELECT t.dayOfWeek, t.timeSlot, t.subjectName, u.name as facultyName, t.facultyId
                FROM timetable t
                LEFT JOIN users u ON t.facultyId = u.id
                WHERE t.department = ? AND t.joinYear = ?
                ORDER BY 
                    FIELD(t.dayOfWeek, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'),
                    FIELD(t.timeSlot, '9-10', '10-11', '11-12', '12-1', '2-3', '3-4', '4-5')
            `, [department, joinYear]);
            
            res.json(timetableRows);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('Get student timetable error:', error);
        res.json([]);
    }
});

// Student endpoints
app.get('/student/:id/attendance', async (req, res) => {
    try {
        let studentAttendance = [];

        if (useDatabase) {
            const [rows] = await db.execute('SELECT * FROM attendance WHERE studentId = ? ORDER BY subjectName, date', [req.params.id]);
            studentAttendance = rows;
        } else {
            studentAttendance = fallbackAttendance.filter(a => a.studentId === req.params.id);
        }

        // Calculate subject-wise attendance
        const subjectWise = {};
        studentAttendance.forEach(record => {
            const subject = record.subjectName;
            if (!subjectWise[subject]) {
                subjectWise[subject] = { total: 0, present: 0, records: [] };
            }
            subjectWise[subject].total++;
            if (record.status === 'present') {
                subjectWise[subject].present++;
            }
            subjectWise[subject].records.push(record);
        });

        // Calculate percentages for each subject
        Object.keys(subjectWise).forEach(subject => {
            const data = subjectWise[subject];
            data.percentage = data.total > 0 ? ((data.present / data.total) * 100).toFixed(2) : 0;
        });

        const totalClasses = studentAttendance.length;
        const presentClasses = studentAttendance.filter(a => a.status === 'present').length;
        const overallPercentage = totalClasses > 0 ? (presentClasses / totalClasses * 100).toFixed(2) : 0;

        res.json({ 
            attendance: studentAttendance, 
            subjectWise,
            totalClasses, 
            presentClasses, 
            percentage: overallPercentage 
        });
    } catch (error) {
        console.error('Get attendance error:', error);
        res.json({ attendance: [], subjectWise: {}, totalClasses: 0, presentClasses: 0, percentage: 0 });
    }
});

app.get('/student/:id/marks', async (req, res) => {
    try {
        if (useDatabase) {
            const [rows] = await db.execute('SELECT subjectName, examType, marks, date FROM marks WHERE studentId = ? ORDER BY subjectName, examType', [req.params.id]);
            res.json(rows);
        } else {
            const studentMarks = fallbackMarks.filter(m => m.studentId === req.params.id);
            res.json(studentMarks);
        }
    } catch (error) {
        console.error('Get marks error:', error);
        res.json([]);
    }
});

// Admin delete endpoints
app.delete('/admin/delete-user/:id', async (req, res) => {
    try {
        if (useDatabase) {
            await db.execute('DELETE FROM users WHERE id = ? AND role != "admin"', [req.params.id]);
        } else {
            Object.keys(fallbackUsers).forEach(role => {
                if (role !== 'admin') {
                    fallbackUsers[role] = fallbackUsers[role].filter(u => u.id !== req.params.id);
                }
            });
        }
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        res.json({ success: false, message: 'Error deleting user' });
    }
});

app.delete('/admin/delete-subject/:id', async (req, res) => {
    try {
        if (useDatabase) {
            await db.execute('DELETE FROM subjects WHERE id = ?', [req.params.id]);
        }
        res.json({ success: true, message: 'Subject deleted successfully' });
    } catch (error) {
        res.json({ success: false, message: 'Error deleting subject' });
    }
});

app.delete('/admin/clear-attendance', async (req, res) => {
    try {
        if (useDatabase) {
            await db.execute('DELETE FROM attendance');
        } else {
            fallbackAttendance.length = 0;
        }
        res.json({ success: true, message: 'All attendance records cleared' });
    } catch (error) {
        res.json({ success: false, message: 'Error clearing attendance' });
    }
});

app.delete('/admin/clear-marks', async (req, res) => {
    try {
        if (useDatabase) {
            await db.execute('DELETE FROM marks');
        } else {
            fallbackMarks.length = 0;
        }
        res.json({ success: true, message: 'All marks cleared' });
    } catch (error) {
        res.json({ success: false, message: 'Error clearing marks' });
    }
});

app.delete('/admin/clear-timetable', async (req, res) => {
    try {
        if (useDatabase) {
            await db.execute('DELETE FROM timetable');
        }
        res.json({ success: true, message: 'All timetable entries cleared' });
    } catch (error) {
        res.json({ success: false, message: 'Error clearing timetable' });
    }
});

// Delete specific attendance record
app.delete('/admin/delete-attendance/:id', async (req, res) => {
    try {
        if (useDatabase) {
            await db.execute('DELETE FROM attendance WHERE id = ?', [req.params.id]);
        }
        res.json({ success: true, message: 'Attendance record deleted' });
    } catch (error) {
        res.json({ success: false, message: 'Error deleting attendance record' });
    }
});

// Delete specific marks record
app.delete('/admin/delete-marks/:id', async (req, res) => {
    try {
        if (useDatabase) {
            await db.execute('DELETE FROM marks WHERE id = ?', [req.params.id]);
        }
        res.json({ success: true, message: 'Marks record deleted' });
    } catch (error) {
        res.json({ success: false, message: 'Error deleting marks record' });
    }
});

// Get all attendance records for admin
app.get('/admin/attendance-records', async (req, res) => {
    try {
        if (useDatabase) {
            const [rows] = await db.execute(`
                SELECT a.*, u.name as studentName 
                FROM attendance a 
                JOIN users u ON a.studentId = u.id 
                ORDER BY a.date DESC, a.subjectName
            `);
            res.json(rows);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.json([]);
    }
});

// Get all marks records for admin
app.get('/admin/marks-records', async (req, res) => {
    try {
        if (useDatabase) {
            const [rows] = await db.execute(`
                SELECT m.*, u.name as studentName 
                FROM marks m 
                JOIN users u ON m.studentId = u.id 
                ORDER BY m.date DESC, m.subjectName
            `);
            res.json(rows);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.json([]);
    }
});

// Faculty-specific endpoints for managing their own records
app.get('/faculty/attendance-records', async (req, res) => {
    try {
        const facultyId = req.query.facultyId;
        if (useDatabase) {
            const [rows] = await db.execute(`
                SELECT a.*, u.name as studentName 
                FROM attendance a 
                JOIN users u ON a.studentId = u.id 
                WHERE a.facultyId = ?
                ORDER BY a.date DESC, a.subjectName
            `, [facultyId]);
            res.json(rows);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.json([]);
    }
});

app.get('/faculty/marks-records', async (req, res) => {
    try {
        const facultyId = req.query.facultyId;
        if (useDatabase) {
            const [rows] = await db.execute(`
                SELECT m.*, u.name as studentName 
                FROM marks m 
                JOIN users u ON m.studentId = u.id 
                WHERE m.facultyId = ?
                ORDER BY m.date DESC, m.subjectName
            `, [facultyId]);
            res.json(rows);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.json([]);
    }
});

app.delete('/faculty/delete-attendance/:id', async (req, res) => {
    try {
        const facultyId = req.query.facultyId;
        if (useDatabase) {
            await db.execute('DELETE FROM attendance WHERE id = ? AND facultyId = ?', [req.params.id, facultyId]);
        }
        res.json({ success: true, message: 'Attendance record deleted' });
    } catch (error) {
        res.json({ success: false, message: 'Error deleting attendance record' });
    }
});

app.delete('/faculty/delete-marks/:id', async (req, res) => {
    try {
        const facultyId = req.query.facultyId;
        if (useDatabase) {
            await db.execute('DELETE FROM marks WHERE id = ? AND facultyId = ?', [req.params.id, facultyId]);
        }
        res.json({ success: true, message: 'Marks record deleted' });
    } catch (error) {
        res.json({ success: false, message: 'Error deleting marks record' });
    }
});

// Start server
startServer().then(() => {
    app.listen(3001, () => {
        console.log('🚀 Server running on http://localhost:3001');
        console.log('👤 Admin login: ID=admin, Password=admin123');
        if (useDatabase) {
            console.log('💾 Using MySQL database');
        } else {
            console.log('💾 Using in-memory storage');
        }
    });
});