# 🏡 Hostel Issue Tracker

An efficient, real-time application designed to streamline issue reporting (maintenance, cleaning, services) within a hostel environment.  
This project replaces noisy group chats by consolidating duplicate reports and providing a dedicated management interface for caretakers.

---

## ✨ Key Features

- **Issue Consolidation:** Automatically groups identical issues reported by different students (same Block, Floor, Category) into a single task for the caretaker.  
- **Role-Based Access:** Separate dashboards for Students (reporting issues, tracking status) and Caretaker (management, verification).  
- **In-App Verification:** Caretaker can approve new student registrations directly in the dashboard by assigning their definitive Block and Room Number.  
- **Real-time Status Tracking:** Students can view the status of their reported issues (`New`, `In Progress`, `Resolved`) in real-time.  
- **Secure Authentication:** User management via Firebase Email/Password authentication with a built-in **Forgot Password** recovery option.  
- **Responsive Design:** Clean, modern UI built with **pure CSS** for optimal use on mobile and desktop devices.

---

## 🛠️ Tech Stack

| Component | Technology |
|------------|-------------|
| **Frontend** | React (SPA - Single Page Application) |
| **Styling** | Pure CSS (Custom Stylesheets) |
| **Database** | Google Firestore (NoSQL, Real-time Data Sync) |
| **Authentication** | Firebase Authentication (Email/Password) |
| **Deployment** | Firebase Hosting |

---

## 🚀 Setup and Deployment

### 🧩 Prerequisites

- [Node.js (LTS version)](https://nodejs.org/) installed  
- A configured [Firebase Project](https://firebase.google.com/)  
- Firebase CLI installed globally  
  ```bash
  npm install -g firebase-tools
  ```

---

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/YourUsername/hostel-issue-tracker.git
cd hostel-issue-tracker
npm install
```

---

### 2️⃣ Configure Firebase

Replace the placeholder Firebase configuration in your main React file (`src/App.jsx`) with your **actual Firebase project credentials**.

---

### 3️⃣ Database Seeding & Security (Crucial Steps)

You must perform these steps **manually** in the Firebase Console.

#### A. Set Security Rules

In **Firestore Database → Rules** tab, publish your final rules to enable read/write access and allow the Collection Group query for verification.  
(These rules are located in your `firestore.rules` file or documented separately.)

#### B. Create Caretaker Account

1. In **Authentication → Sign-in method**, ensure **Email/Password** is enabled.  
2. In **Authentication → Users**, manually create the caretaker account.  
3. In **Firestore Database → Data**, create the caretaker's profile document:

```
/artifacts/{projectId}/users/{Caretaker_UID}/profiles/userProfile
```

With the following fields:

```json
{
  "role": "caretaker",
  "block": "ADMIN",
  "roomNumber": "ADMIN"
}
```

---

### 4️⃣ Build and Deploy

Use the Firebase CLI to build and deploy the project:

```bash
# 1. Build the production files (creates the 'dist' folder)
npm run build

# 2. Deploy the application (will output the Hosting URL)
firebase deploy
```

---

## 📋 Usage Workflow

### 👩‍🎓 Student Flow

1. **Register:** Student signs up with their email.  
2. **Verify:** Student is immediately taken to the Verification Form to submit their Block and Room Number.  
3. **Approve:** After the Caretaker approves the request, the student gains access.  
4. **Report & Track:** Student can report new issues and track their status (`My Issues` tab) in real-time.

---

### 👷 Caretaker Flow

1. **Login:** Logs in with the privileged caretaker account.  
2. **Verify New Users:** Checks the **👤 Verify Users** tab — this panel shows all pending students who have submitted their details.  
   - Click **Approve Access** to verify the student.  
3. **Manage Issues:** Uses the Dashboard and Block tabs to view consolidated, active tasks.

---

## 🤝 Contributing

This project currently uses **pure CSS**.  
Future enhancements may include:
- Push notifications for urgent issues  
- Integration with Firebase Cloud Messaging  

### Steps to Contribute:
1. Fork the repository.  
2. Create your feature branch:
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. Commit your changes:
   ```bash
   git commit -m "Add some AmazingFeature"
   ```
4. Push to the branch:
   ```bash
   git push origin feature/AmazingFeature
   ```
5. Open a Pull Request 🚀

---

⭐ **If you found this project helpful, don’t forget to give it a star!**
