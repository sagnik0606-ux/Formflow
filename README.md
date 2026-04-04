# FormFlow — Google Forms Replica for College

A Google Forms replica built specifically for college instructors and students. Create, distribute, and analyze forms with advanced features like form templates, role-based access, deadline management, and comprehensive response analytics.

## 🎯 Features

### For Faculty/Instructors
- **Create Custom Forms** — Build surveys, quizzes, feedback forms, and questionnaires
- **Multiple Question Types** — Text, textarea, number, email, date, and multiple-choice (MCQ)
- **Form Templates** — Quick-start with 7 pre-built templates:
  - Event Registration
  - Course Evaluation
  - Faculty Feedback Form
  - Quiz / Internal Test
  - Leave Application
  - Lab Feedback
  - Doubt/Query Submission
- **Access Control** — Public forms or department-specific group forms
- **Deadline Management** — Set response deadlines and auto-close expired forms
- **Response Management** — View, filter, and download responses in real-time
- **Report Release** — Control when students can see form results
- **Theme Customization** — Choose theme colors for forms
- **Response Restrictions** — Allow single or multiple responses per student

### For Students
- **Easy Form Access** — Access forms via unique form codes
- **Fill & Submit** — Intuitive interface for completing forms
- **Multi-question Support** — Answer various question types seamlessly
- **Submission Confirmation** — Get confirmation after submission
- **View Results** — See form results when instructor releases reports

### Technical Highlights
- **Oracle Database** — Enterprise-grade SQL backend
- **Advanced Triggers & Procedures** — PL/SQL automation for deadline validation and response tracking
- **Audit Logging** — Track form creation and response submissions
- **JSON Templates** — Efficient template storage using CLOB

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| **Backend** | Node.js with Express.js (ES6 modules) |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript, Tailwind CSS |
| **Database** | Oracle SQL (XEPDB1) with PL/SQL |
| **Server** | Express.js (v5.2.1) |
| **ORM/Driver** | oracledb (v6.10.0) |

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) v16+ (uses `--env-file` flag)
- [npm](https://www.npmjs.com/) v8+
- [Oracle Database](https://www.oracle.com/database/) (XE, Enterprise, or compatible)
- Git

## 🚀 Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/formflow.git
cd formflow
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Oracle Database

**Create/Update `.env` file:**

```env
DB_USER=sagnik
DB_PASSWORD=sagnik123
DB_HOST=localhost
DB_PORT=1521
DB_SERVICE=XEPDB1
NODE_ENV=development
PORT=8000
```

> **⚠️ Important:** Never commit `.env` to Git. It's already in `.gitignore`.

### 4. Create Database Schema

Run the SQL setup script in your Oracle Database (SQL Developer or SQL*Plus):

```bash
# Via SQL Developer, run project_db.sql entirely
# OR via sqlplus:
sqlplus sagnik/sagnik123@XEPDB1 @project_db.sql
```

This creates:
- **8 tables** (users, forms, questions, options, responses, answers, audit_logs, form_templates)
- **4 PL/SQL triggers** (deadline validation, response blocking, audit tracking)
- **2 PL/SQL procedures** (form status toggle, expire forms)
- **1 PL/SQL function** (count responses)
- **7 pre-loaded form templates** (JSON-based)
- **Sample data** (2 users, 2 forms, questions, responses)

### 5. Start the Server

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Server runs at **`http://localhost:8000`**

## 📚 Project Structure

```
formflow/
├── public/
│   ├── signin.html           # Login page (glass-morphism UI)
│   ├── dashboard.html        # Main instructor dashboard
│   ├── newForm.js            # Create/edit forms + template selection
│   ├── myForms.js            # Instructor's form list + management
│   ├── fillForm.js           # Student form-filling interface
│   ├── myResponses.html      # Student view their responses
│   └── audit.js              # Audit log viewer
├── routes/
│   ├── auth.js               # Login/signup endpoints
│   ├── forms.js              # Form CRUD + template endpoints
│   └── responses.js          # Response submission + retrieval
├── db.js                     # Oracle connection manager
├── server.js                 # Express app entry point
├── package.json              # Dependencies + scripts
├── project_db.sql            # Full database schema + data
├── tmp_db_update.js          # Migration script (run once)
├── .env                      # Database credentials (NEVER commit)
├── .gitignore                # Git ignore rules
└── README.md                 # This file
```

## 🔌 API Endpoints

### Authentication

- `POST /auth/login` — User login
  - Body: `{ email, password }`
  - Response: `{ ok: true, redirect: "/dashboard.html?user_id=X" }`

- `POST /auth/signup` — User registration
  - Body: `{ name, email, password, user_type (student|faculty), department, batch? }`

### Forms

- `POST /forms/create` — Create new form
  - Body: `{ title, description, access_type, target_dept?, deadline, theme_color? }`
  - Response: `{ form_id, form_code }`

- `GET /forms/all` — Get all user's forms
  - Returns: Form list with response counts

- `GET /forms/:formId` — Get form details + questions
  - Returns: Form + questions + options

- `PUT /forms/:formId` — Update form details

- `DELETE /forms/:formId` — Delete form

- `GET /forms/by-code/:code` — Get form by unique code (student access)

- `GET /forms/templates` — Get all form templates

- `POST /forms/from-template` — Create form from template

### Responses

- `POST /responses/submit` — Submit form response
  - Body: `{ form_id, answers: [{ question_id, answer_text|answer_number|option_id }] }`

- `GET /responses/form/:formId` — Get all responses to a form (instructor only)
  - Returns: Aggregate stats + individual responses

- `GET /responses/user/:userId` — Get responses submitted by user (student view)

## 🗄️ Database Schema Overview

### Tables
| Table | Purpose |
|-------|---------|
| `users` | Faculty & student accounts |
| `forms` | Form definitions + metadata |
| `questions` | Form questions with types |
| `options` | MCQ options |
| `responses` | Form submissions (one per student per form) |
| `answers` | Individual answers to questions |
| `form_templates` | JSON-based form templates |
| `audit_logs` | Action tracking (create, submit, etc.) |

### Key Constraints
- Forms cannot have past deadlines (trigger: `trg_form_deadline_check`)
- Responses blocked on expired/closed forms (trigger: `trg_prevent_invalid_response`)
- Auto-populate response counts via function: `fn_get_response_count()`

## 🎨 Frontend Features

### Glass-Morphism UI
- Modern frosted glass design using Tailwind CSS
- DM Sans font family
- Toast notifications (error/success)
- Responsive mobile-first layout

### Sign-In Page
- Email + password authentication
- Sign-up toggle for new users
- Remember-me option (optional)

### Dashboard (Instructor)
- Overview: Total forms, responses pending, active forms
- Create new form or from template
- Manage existing forms (edit, delete, view responses)
- Analytics sidebar

### Form Creation (`newForm.js`)
- Drag-and-drop question reordering
- Add/remove questions dynamically
- Rich question customization (required field, help text)
- Template quick-start
- Live preview

### Form Filling (`fillForm.js`)
- Progressive form rendering
- Type-specific input validation
- Progress indicator
- Submit confirmation

## 🔐 Security Notes

1. **Database Credentials** — Use `.env`, never hardcode
2. **Password Storage** — Currently plain text (⚠️ upgrade to bcrypt for production)
3. **Input Validation** — Sanitize all Oracle bind parameters
4. **CORS** — Enabled globally (restrict in production)
5. **Audit Logs** — Track all create/submit actions

## 🚦 Running the App

### Development
```bash
npm run dev
# Auto-reloads on file changes
```

### Production
```bash
npm start
```

### Test Data
After running `project_db.sql`:
- **Faculty Account:** email alice.miller@college.edu (password: hashedpw123)
- **Student Account:** email Dr. Bob Smith (password: hashedpw456)
- **Sample Forms:** "Midsem Feedback" (Form ID: 1), "CS Dept Survey" (Form ID: 2)

## 🐛 Troubleshooting

### "Cannot connect to database"
```bash
# Check Oracle is running
sqlplus /nolog
SQL> connect sagnik/sagnik123@XEPDB1

# Check .env credentials match
cat .env
```

### "Module not found" errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Port 8000 already in use
```bash
# Change in .env: PORT=8001
# Or kill the process:
lsof -i :8000
kill -9 <PID>
```

### Form won't submit
- Check deadline hasn't passed (DB trigger will reject)
- Verify all required questions are answered
- Check `audit_logs` table for errors

## 📈 Future Enhancements

- [ ] Bcrypt password hashing
- [ ] JWT authentication with refresh tokens
- [ ] Conditional branching (skip logic)
- [ ] Email notifications on new responses
- [ ] Advanced analytics charts (Chart.js/D3.js)
- [ ] LMS integration (Canvas, Blackboard)
- [ ] Export to CSV/PDF with formatting
- [ ] Role-based access control (department admin)
- [ ] Form versioning & drafts
- [ ] Real-time collaboration (WebSockets)
- [ ] Mobile app (React Native)

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

## 👨‍💻 Author

**Sagnik**  
GitHub: [@YOUR_USERNAME](https://github.com/sagnik0606-ux)  
Email: basu.sagnik5@gmail.com

## 🙋 Support

Found a bug or have a feature request?  
[Open an issue](https://github.com/sagnik0606-ux/formflow/issues) on GitHub.

---

**Made with ❤️ for educators and students everywhere**
