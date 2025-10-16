// setCaretakerRole.js
import admin from "firebase-admin";

// Initialize with your service account key
admin.initializeApp({
  credential: admin.credential.cert("./serviceAccountKey.json"),
});

async function setCaretakerRole(uid) {
  await admin.auth().setCustomUserClaims(uid, { role: "caretaker" });
  console.log(`Caretaker role added to user: ${uid}`);
}

const uid = "Upo2wPsbf7eOWtX2X5tCAF4acLU2"; // Replace with actual UID from Firebase Console
setCaretakerRole(uid);
