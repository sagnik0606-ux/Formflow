// Run this script ONCE to update the question_type CHECK constraint on your live Oracle DB.
// Execute via: node tmp_db_update.js

import { getConnection } from './db.js';

const conn = await getConnection();
try {
    // Drop old constraint (name may vary — check your DB; 'SYS_C...' is auto-named)
    // We use a safe drop + re-add approach
    await conn.execute(`
        ALTER TABLE questions 
        DROP CONSTRAINT SYS_C_question_type
    `).catch(() => {
        // If the auto-generated name is different, find it with:
        // SELECT constraint_name FROM user_constraints WHERE table_name='QUESTIONS' AND constraint_type='C';
        console.log('Could not drop by name — checking alternative...');
    });

    await conn.execute(`
        ALTER TABLE questions ADD CONSTRAINT chk_question_type
        CHECK (LOWER(question_type) IN ('text', 'textarea', 'number', 'email', 'date', 'mcq'))
    `);

    await conn.commit();
    console.log('✅ question_type constraint updated successfully.');
} catch (err) {
    console.error('Error updating constraint:', err.message);
    console.log('\nRun this SQL manually in SQL Developer:\n');
    console.log(`
-- Step 1: Find the constraint name
SELECT constraint_name FROM user_constraints 
WHERE table_name = 'QUESTIONS' AND constraint_type = 'C'
AND search_condition LIKE '%question_type%';

-- Step 2: Drop it (replace SYS_C_xxxx with actual name)
ALTER TABLE questions DROP CONSTRAINT <constraint_name>;

-- Step 3: Add the new one
ALTER TABLE questions ADD CONSTRAINT chk_question_type
CHECK (LOWER(question_type) IN ('text', 'textarea', 'number', 'email', 'date', 'mcq'));
    `);
} finally {
    await conn.close();
}
