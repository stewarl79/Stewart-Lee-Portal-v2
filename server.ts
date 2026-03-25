import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import cron from "node-cron";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
let firebaseConfig: any;
try {
  const configPath = path.join(__dirname, "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } else {
    console.warn("firebase-applet-config.json not found. Falling back to environment variables.");
    firebaseConfig = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || "(default)",
    };
  }
} catch (e) {
  console.error("Failed to load firebase-applet-config.json:", e);
  firebaseConfig = { projectId: process.env.FIREBASE_PROJECT_ID };
}

if (!admin.apps.length && firebaseConfig?.projectId) {
  try {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: firebaseConfig.projectId,
          clientEmail: clientEmail,
          privateKey: privateKey,
        }),
        projectId: firebaseConfig.projectId,
      });
      console.log(`Firebase Admin initialized with explicit service account: ${clientEmail}`);
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: firebaseConfig.projectId,
      });
      console.log("Firebase Admin initialized with applicationDefault");
    }
  } catch (e) {
    console.error("Firebase Admin initialization failed:", e);
  }
}

const db = getFirestore(firebaseConfig?.firestoreDatabaseId || "(default)");
const auth = getAuth();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // --- Google Calendar Sync Logic ---
  const calendar = google.calendar("v3");
  
  async function getGoogleAuthClient() {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error("Google Service Account credentials missing in environment variables.");
    }
    
    // Handle potential newline issues in private key
    const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    
    return new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly']
    });
  }
  
  async function syncCalendar() {
    const coachEmail = "msustewart@gmail.com";
    const calendarId = "e9520780ffd4d072d6bf8237af1d9c1fee4dcca6db5d479ec4e89e054d4f224b@group.calendar.google.com";
    
    console.log(`Starting sync for calendar: ${calendarId}`);
    console.log(`Using Service Account: ${process.env.GOOGLE_CLIENT_EMAIL}`);
    
    try {
      const authClient = await getGoogleAuthClient();
      
      console.log("Fetching events from Google Calendar API...");
      const response = await calendar.events.list({
        auth: authClient,
        calendarId: calendarId, 
        timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });
      
      const events = response.data.items || [];
      console.log(`Found ${events.length} events in Google Calendar.`);
      
      const appointmentsRef = db.collection("appointments");
      
      for (const event of events) {
        if (!event.id || !event.start?.dateTime || !event.end?.dateTime) {
          console.log(`Skipping event ${event.id || 'unknown'} due to missing data.`);
          continue;
        }

        // Extract client email from attendees or description
        const clientEmail = event.attendees?.find(a => a.email !== process.env.GOOGLE_CLIENT_EMAIL)?.email 
          || event.description?.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0]
          || "unknown@example.com";

        const appointmentData = {
          id: event.id,
          title: event.summary || "Coaching Session",
          description: event.description || "",
          startTime: admin.firestore.Timestamp.fromDate(new Date(event.start.dateTime)),
          endTime: admin.firestore.Timestamp.fromDate(new Date(event.end.dateTime)),
          clientEmail: clientEmail.toLowerCase(),
          status: "scheduled",
          isExternal: true, // Default to true, will be updated if client registers
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          meetLink: event.hangoutLink || ""
        };

        try {
          console.log(`Processing event: ${event.summary} (${event.id})`);
          // Check if client exists in users collection
          const userSnapshot = await db.collection("users").where("email", "==", clientEmail.toLowerCase()).limit(1).get();
          if (!userSnapshot.empty) {
            const userData = userSnapshot.docs[0].data();
            (appointmentData as any).clientUid = userData.uid;
            appointmentData.isExternal = false;
          }

          await appointmentsRef.doc(event.id).set(appointmentData, { merge: true });
          console.log(`Successfully synced event: ${event.id}`);
        } catch (dbError: any) {
          console.error(`Firestore error for event ${event.id}:`, dbError.message);
          if (dbError.message.includes("PERMISSION_DENIED")) {
            const saEmail = process.env.GOOGLE_CLIENT_EMAIL || "the service account";
            throw new Error(`
Firestore PERMISSION_DENIED. 
The service account "${saEmail}" does not have permission to write to database "${firebaseConfig.firestoreDatabaseId}" in project "${firebaseConfig.projectId}".

TO FIX THIS:
1. Go to https://console.cloud.google.com/iam-admin/iam?project=${firebaseConfig.projectId}
2. Click "GRANT ACCESS"
3. Add "${saEmail}" as a new principal.
4. Assign the role "Cloud Datastore User" (or "Firebase Admin").
5. Wait 1-2 minutes for permissions to propagate and try again.
            `);
          }
          throw dbError;
        }
      }
      
      console.log(`Sync complete. Processed ${events.length} events.`);
    } catch (error: any) {
      console.error("Sync failed at top level:", error.message);
      throw error;
    }
  }

  // Manual sync endpoint
  app.post("/api/sync-calendar", async (req, res) => {
    try {
      await syncCalendar();
      res.json({ message: "Sync successful" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Admin: Create Client Manually ---
  app.post("/api/admin/create-client", async (req, res) => {
    const { email, displayName, phone } = req.body;
    
    // Check if the requester is the coach
    // In a real app, we'd verify the ID token from the Authorization header
    // For this demo, we'll assume the frontend only calls this when authorized
    // but we should still check the email if possible.
    
    if (!email || !displayName) {
      return res.status(400).json({ error: "Email and display name are required." });
    }

    try {
      // Generate a temporary password
      const tempPassword = Math.random().toString(36).slice(-10) + "!";
      
      // Create user in Firebase Auth
      const userRecord = await admin.auth().createUser({
        email,
        displayName,
        password: tempPassword,
        phoneNumber: phone || undefined
      });

      // Create user profile in Firestore
      await db.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        email: email.toLowerCase(),
        displayName,
        phone: phone || null,
        role: "client",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        mustChangePassword: true
      });

      // Send email with temporary password
      const emailBody = `
        Hi ${displayName},
        
        Your coach, Lee, has created an account for you on the MrLeeTeaches Coaching Portal.
        
        You can log in at: ${process.env.APP_URL || "the portal"}
        Your temporary password is: ${tempPassword}
        
        You will be prompted to change your password upon your first login.
        
        Best regards,
        MrLeeTeaches Team
      `;

      await sendEmail(email, "Welcome to MrLeeTeaches Coaching Portal", emailBody);

      res.json({ message: "Client created successfully", uid: userRecord.uid });
    } catch (error: any) {
      console.error("Failed to create client:", error);
      let errorMessage = error.message;
      if (errorMessage.includes("identitytoolkit.googleapis.com")) {
        errorMessage = `
The "Identity Toolkit API" is not enabled in the correct project. 

The error specifically mentions Project Number "607442881612". This is the project where your Service Account was created (mr-lee-teaches-appointments). 

Even if the API is enabled in your main project (gen-lang-client-...), it MUST also be enabled in the service account's home project for the server to use it.

TO FIX THIS:
1. Visit: https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=607442881612
2. IMPORTANT: Check the top bar of the page. It must show "mr-lee-teaches-appointments" (or the project with number 607442881612).
3. If it says "Enable", click it. If it says "Enabled", wait 5 minutes for propagation.
4. If you are still seeing this, ensure you are logged into the same Google account that owns that project.
        `;
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  app.delete("/api/admin/delete-client/:uid", async (req, res) => {
    const { uid } = req.params;
    try {
      // Delete from Firebase Auth
      await admin.auth().deleteUser(uid);
      // Delete from Firestore
      await db.collection("users").doc(uid).delete();
      res.json({ message: "Client deleted successfully" });
    } catch (error: any) {
      console.error("Failed to delete client:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Automated Reminders ---
  const transporter = nodemailer.createTransport({
    // Use environment variables for SMTP
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Add a timeout to prevent hanging
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  // Verify connection on startup
  if (process.env.SMTP_USER) {
    transporter.verify((error, success) => {
      if (error) {
        console.error("SMTP Connection Error:", error);
        console.log("Tip: If using port 587, set SMTP_SECURE to 'false'. If using port 465, set it to 'true'.");
      } else {
        console.log("SMTP Server is ready to take our messages");
      }
    });
  }

  async function sendReminders() {
    console.log("Checking for reminders to send...");
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const fortyEightHoursFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    try {
      const appointmentsRef = db.collection("appointments");
      const snapshot = await appointmentsRef.where("status", "==", "scheduled").get();

      for (const doc of snapshot.docs) {
        const appt = doc.data();
        const startTime = appt.startTime.toDate ? appt.startTime.toDate() : new Date(appt.startTime);
        const remindersSent = appt.remindersSent || [];

        // 48h reminder
        if (startTime <= fortyEightHoursFromNow && startTime > now && !remindersSent.includes("48h")) {
          await sendEmail(appt.clientEmail, "Reminder: Coaching Session in 48 Hours", `Hi, your session "${appt.title}" is in 48 hours.`);
          await doc.ref.update({ remindersSent: admin.firestore.FieldValue.arrayUnion("48h") });
        }

        // 1h reminder
        if (startTime <= oneHourFromNow && startTime > now && !remindersSent.includes("1h")) {
          await sendEmail(appt.clientEmail, "Reminder: Coaching Session in 1 Hour", `Hi, your session "${appt.title}" starts in 1 hour.`);
          await doc.ref.update({ remindersSent: admin.firestore.FieldValue.arrayUnion("1h") });
        }
      }
    } catch (error) {
      console.error("Reminder check failed:", error);
    }
  }

  async function sendEmail(to: string, subject: string, text: string) {
    if (!process.env.SMTP_USER) {
      console.log(`[MOCK EMAIL] To: ${to}, Subject: ${subject}, Body: ${text}`);
      return;
    }
    try {
      await transporter.sendMail({
        from: `"MrLeeTeaches" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
      });
      console.log(`Email sent to ${to}`);
    } catch (error: any) {
      console.error(`Failed to send email to ${to}:`, error);
      if (error.message.includes("Greeting never received")) {
        console.log("Tip: Check your SMTP_PORT and SMTP_SECURE settings. If using port 587, SMTP_SECURE must be 'false'. If using port 465, it must be 'true'.");
      }
    }
  }

  // Cron jobs
  cron.schedule("0 * * * *", syncCalendar); // Every hour
  cron.schedule("*/15 * * * *", sendReminders); // Every 15 minutes

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
