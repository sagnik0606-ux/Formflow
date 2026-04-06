import express from "express";
import oracledb from "oracledb";
import { getConnection } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

function generateFormCode() {
  return "FF-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function autoCloseExpiredForms(conn) {
    try {
        await conn.execute(`BEGIN prc_close_expired_forms; END;`);
    } catch (err) {
        console.warn("Auto-close procedure failed, but ignoring:", err.message);
    }
}

const router = express.Router();

router.post("/create", requireAuth, async (req, res) => {
    const { title, description, questions, access_type, deadline, target_dept, theme, allow_multiple } = req.body;
    const creator_id = req.user.id; // from JWT, not client

    if (access_type === "group" && !target_dept) {
        return res.status(400).json({ message: "target_dept required for group access" });
    }
    const form_code = generateFormCode();

    let conn;
    try {
        conn = await getConnection();
        const formResult = await conn.execute(
            `insert into forms 
            (form_code, title, description, creator_id, access_type, target_dept, deadline, status, theme_color, allow_multiple) 
            values 
            (:form_code, :title, :description, :creator_id, :access_type, :target_dept, 
            to_timestamp(:deadline, 'YYYY-MM-DD"T"HH24:MI'), 'open', :theme_color, :allow_multiple) 
            returning form_id into :form_id`,
            {
                form_code, title, description, creator_id, access_type,
                target_dept: access_type === "group" ? target_dept : null,
                deadline,
                theme_color: theme || 'emerald',
                allow_multiple: allow_multiple || 'no',
                form_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
            }
        );
        const formId = formResult.outBinds.form_id[0];

        for (const q of questions) {
            const qResult = await conn.execute(
                `insert into questions (form_id, question_text, question_type, is_required)
                values (:form_id, :text, :type, :required) returning question_id into :qid`,
                {
                    form_id: formId, text: q.text, type: q.type,
                    required: q.required ? 1 : 0,
                    qid: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
                }
            );
            const questionId = qResult.outBinds.qid[0];
            if (q.type === "mcq") {
                for (const opt of q.options) {
                    await conn.execute(
                        `insert into options (question_id, option_text) values (:qid, :opt)`,
                        { qid: questionId, opt }
                    );
                }
            }
        }

        await conn.commit();
        res.json({ message: "Form created successfully", form_id: formId, form_code });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error(err);
        res.status(500).json({ message: "Failed to create form" });
    } finally {
        if (conn) await conn.close();
    }
});

router.get('/code/:code', requireAuth, async (req, res) => {
    const { code } = req.params;
    const userId = req.user.id; // from JWT

    let conn;
    try {
        conn = await getConnection();
        await autoCloseExpiredForms(conn);

        const formResult = await conn.execute(
            `select form_id, title, description, access_type, target_dept, deadline, theme_color, allow_multiple from forms where form_code = :code`,
            { code }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (formResult.rows.length === 0) {
            return res.status(404).json({ message: "Form not found" });
        }
        const form = formResult.rows[0];

        const userDept = await conn.execute(
            `select department from users where user_id = :user_id`,
            { user_id: userId }
        );
        if (form.ACCESS_TYPE === "group" && form.TARGET_DEPT !== userDept.rows[0].DEPARTMENT) {
            return res.status(403).json({ message: "You do not have access to this form" });
        }

        const qResult = await conn.execute(
            `select question_id, question_text, question_type, is_required from questions where form_id = :form_id order by question_id`,
            { form_id: form.FORM_ID }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const oResult = await conn.execute(
            `select question_id, option_id, option_text from options where question_id in (select question_id from questions where form_id = :fid) order by option_id`,
            { fid: form.FORM_ID }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({ form, questions: qResult.rows, options: oResult.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to retrieve form" });
    } finally {
        if (conn) await conn.close();
    }
});

router.get("/myforms", requireAuth, async (req, res) => {
    const userid = req.user.id; // from JWT — no IDOR possible

    let conn;
    try {
        conn = await getConnection();
        await autoCloseExpiredForms(conn);
        const result = await conn.execute(
            `select form_id, title, description, form_code, status, deadline, created_at, access_type, target_dept, report_released from forms where creator_id = :userid order by created_at desc`,
            { userid },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch forms" });
    } finally {
        if (conn) await conn.close();
    }
});

router.post("/toggle-status", requireAuth, async (req, res) => {
    const { form_id } = req.body;
    const userId = req.user.id;

    let conn;
    try {
        conn = await getConnection();

        // Verify ownership before toggling
        const ownerCheck = await conn.execute(
            `select creator_id from forms where form_id = :fid`,
            { fid: Number(form_id) }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (ownerCheck.rows.length === 0) return res.status(404).json({ message: "Form not found" });
        if (ownerCheck.rows[0].CREATOR_ID !== userId) return res.status(403).json({ message: "Unauthorized" });

        const result = await conn.execute(
            `BEGIN prc_toggle_form_status(:fid, :new_status); END;`,
            { fid: Number(form_id), new_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 } }
        );
        return res.json({ message: `Form is now ${result.outBinds.new_status}`, status: result.outBinds.new_status });
    } catch (err) {
        console.error(err);
        if (err.message.includes("ORA-01403")) return res.status(404).json({ message: "Form not found" });
        return res.status(500).json({ message: "Failed to update status" });
    } finally {
        if (conn) await conn.close();
    }
});

router.post("/toggle-report", requireAuth, async (req, res) => {
    const { form_id } = req.body;
    const userId = req.user.id;

    let conn;
    try {
        conn = await getConnection();

        const ownerCheck = await conn.execute(
            `select creator_id, report_released from forms where form_id = :fid`,
            { fid: Number(form_id) }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (ownerCheck.rows.length === 0) return res.status(404).json({ message: "Form not found" });
        if (ownerCheck.rows[0].CREATOR_ID !== userId) return res.status(403).json({ message: "Unauthorized" });

        const newVal = ownerCheck.rows[0].REPORT_RELEASED === "yes" ? "no" : "yes";
        await conn.execute(
            `update forms set report_released = :val where form_id = :fid`,
            { val: newVal, fid: Number(form_id) }
        );
        await conn.commit();
        res.json({ message: "Report visibility updated", status: newVal });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error(err);
        res.status(500).json({ message: "Failed to update report status" });
    } finally {
        if (conn) await conn.close();
    }
});

router.get("/get-templates", async (req, res) => {
    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `select template_id, name, description, to_char(structure) as structure from form_templates order by template_id`,
            [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch templates" });
    } finally {
        if (conn) await conn.close();
    }
});

router.get("/audit-logs", requireAuth, async (req, res) => {
    if (req.user.type.toLowerCase() !== 'faculty') {
        return res.status(403).json({ message: "forbidden: faculty only" });
    }

    let conn;
    try {
        conn = await getConnection();
        const result = await conn.execute(
            `select l.log_time, l.action_type, u.name as user_name, f.title as form_title 
             from audit_logs l
             left join users u on l.user_id = u.user_id
             left join forms f on l.form_id = f.form_id
             order by l.log_time desc fetch first 50 rows only`,
            [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch logs" });
    } finally {
        if (conn) { try { await conn.close(); } catch (e) { console.error(e); } }
    }
});

router.get("/:id/edit", requireAuth, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    let conn;
    try {
        conn = await getConnection();
        const fRes = await conn.execute(
            `select form_id, title, description, access_type, target_dept, deadline, theme_color, allow_multiple, creator_id from forms where form_id = :id`,
            { id: Number(id) }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (fRes.rows.length === 0) return res.status(404).json({ message: "Form not found" });
        if (fRes.rows[0].CREATOR_ID !== userId) return res.status(403).json({ message: "Unauthorized" });

        const qRes = await conn.execute(
            `select question_id, question_text, question_type, is_required from questions where form_id = :id order by question_id`,
            { id: Number(id) }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const oRes = await conn.execute(
            `select question_id, option_id, option_text from options where question_id in (select question_id from questions where form_id = :id) order by option_id`,
            { id: Number(id) }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const rRes = await conn.execute(
            `select count(*) as cnt from responses where form_id = :id`,
            { id: Number(id) }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ form: fRes.rows[0], questions: qRes.rows, options: oRes.rows, hasResponses: rRes.rows[0].CNT > 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to load form for editing" });
    } finally {
        if (conn) await conn.close();
    }
});

router.put("/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const { title, description, deadline, access_type, target_dept, theme, allow_multiple, questions } = req.body;
    let conn;
    try {
        conn = await getConnection();
        const ownerRes = await conn.execute(
            `select creator_id from forms where form_id = :id`,
            { id: Number(id) }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (ownerRes.rows.length === 0) return res.status(404).json({ message: "Form not found" });
        if (ownerRes.rows[0].CREATOR_ID !== userId) return res.status(403).json({ message: "Unauthorized" });

        const rRes = await conn.execute(
            `select count(*) as cnt from responses where form_id = :id`,
            { id: Number(id) }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const hasResponses = rRes.rows[0].CNT > 0;

        await conn.execute(
            `update forms set title=:title, description=:description,
               deadline=to_timestamp(:deadline, 'YYYY-MM-DD"T"HH24:MI'),
               access_type=:access_type, target_dept=:target_dept,
               theme_color=:theme, allow_multiple=:allow_multiple
             where form_id = :id`,
            {
                title, description, deadline, access_type,
                target_dept: access_type === "group" ? target_dept : null,
                theme: theme || "emerald",
                allow_multiple: allow_multiple || "no",
                id: Number(id)
            }
        );

        if (!hasResponses && Array.isArray(questions) && questions.length > 0) {
            await conn.execute(`delete from questions where form_id = :id`, { id: Number(id) });
            for (const q of questions) {
                const qResult = await conn.execute(
                    `insert into questions (form_id, question_text, question_type, is_required) values (:form_id, :text, :type, :required) returning question_id into :qid`,
                    { form_id: Number(id), text: q.text, type: q.type, required: q.required ? 1 : 0, qid: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }
                );
                const questionId = qResult.outBinds.qid[0];
                if (q.type === "mcq") {
                    for (const opt of q.options) {
                        await conn.execute(`insert into options (question_id, option_text) values (:qid, :opt)`, { qid: questionId, opt });
                    }
                }
            }
        }

        await conn.commit();
        res.json({ message: "Form updated successfully", questionsLocked: hasResponses });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error(err);
        res.status(500).json({ message: "Failed to update form" });
    } finally {
        if (conn) await conn.close();
    }
});

router.delete("/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    let conn;
    try {
        conn = await getConnection();
        const ownerRes = await conn.execute(
            `select creator_id from forms where form_id = :id`,
            { id: Number(id) }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (ownerRes.rows.length === 0) return res.status(404).json({ message: "Form not found" });
        if (ownerRes.rows[0].CREATOR_ID !== userId) return res.status(403).json({ message: "Unauthorized" });

        await conn.execute(`delete from forms where form_id = :id`, { id: Number(id) });
        await conn.commit();
        res.json({ message: "Form deleted successfully" });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error(err);
        res.status(500).json({ message: "Failed to delete form" });
    } finally {
        if (conn) await conn.close();
    }
});

export default router;
