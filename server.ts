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
  const drive = google.drive("v3");

  // OAuth2 client for Coach's personal Drive access
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  // Helper to get authorized Drive client
  async function getDriveClient() {
    const tokensDoc = await db.collection("config").doc("google_drive_tokens").get();
    if (!tokensDoc.exists) {
      throw new Error("Google Drive not connected. Please connect your account in settings.");
    }
    const tokens = tokensDoc.data()!;
    oauth2Client.setCredentials(tokens);

    // Refresh token if needed
    oauth2Client.on('tokens', async (newTokens) => {
      if (newTokens.refresh_token) {
        await db.collection("config").doc("google_drive_tokens").set(newTokens, { merge: true });
      } else {
        await db.collection("config").doc("google_drive_tokens").set({
          access_token: newTokens.access_token,
          expiry_date: newTokens.expiry_date,
          token_type: newTokens.token_type,
          scope: newTokens.scope
        }, { merge: true });
      }
    });

    return drive;
  }

  // Auth Routes
  app.get("/api/auth/google/url", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive'],
      prompt: 'consent'
    });
    res.json({ url });
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      await db.collection("config").doc("google_drive_tokens").set(tokens);
      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white;">
            <div style="text-align: center; background: #1e293b; padding: 2rem; border-radius: 1rem; border: 1px solid #334155;">
              <h2 style="color: #10b981;">Connection Successful!</h2>
              <p>Your Google Drive is now connected to the portal.</p>
              <p>You can close this window now.</p>
              <script>
                setTimeout(() => window.close(), 3000);
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      res.status(500).send("Authentication failed: " + error.message);
    }
  });

  app.get("/api/drive/status", async (req, res) => {
    const tokensDoc = await db.collection("config").doc("google_drive_tokens").get();
    res.json({ connected: tokensDoc.exists });
  });

  app.post("/api/drive/disconnect", async (req, res) => {
    try {
      await db.collection("config").doc("google_drive_tokens").delete();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Library Routes
  app.get("/api/drive/library", async (req, res) => {
    try {
      const driveClient = await getDriveClient();
      const folderId = process.env.GOOGLE_DRIVE_LIBRARY_FOLDER_ID;
      
      console.log(`Fetching library from folder: ${folderId}`);
      
      if (!folderId) {
        return res.status(400).json({ error: "Library folder ID not configured." });
      }

      const response = await driveClient.files.list({
        auth: oauth2Client,
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, webViewLink, iconLink)',
        orderBy: 'name'
      });

      console.log(`Found ${response.data.files?.length || 0} files in library.`);
      res.json(response.data.files || []);
    } catch (error: any) {
      console.error("Library fetch error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/drive/share", async (req, res) => {
    const { fileId, fileName, clientUid, clientName, clientEmail, coachUid } = req.body;
    
    if (!fileId || !clientUid || !clientName || !clientEmail) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    try {
      const driveClient = await getDriveClient();
      const rootFolderId = process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID;

      if (!rootFolderId) {
        throw new Error("Clients root folder ID not configured.");
      }

      // 1. Find or create client folder
      let clientFolderId: string;
      const folderSearch = await driveClient.files.list({
        auth: oauth2Client,
        q: `'${rootFolderId}' in parents and name = '${clientName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id)'
      });

      if (folderSearch.data.files && folderSearch.data.files.length > 0) {
        clientFolderId = folderSearch.data.files[0].id!;
      } else {
        const newFolder = await driveClient.files.create({
          auth: oauth2Client,
          requestBody: {
            name: clientName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [rootFolderId]
          },
          fields: 'id'
        });
        clientFolderId = newFolder.data.id!;
      }

      // 2. Copy file to client folder
      const copyResponse = await driveClient.files.copy({
        auth: oauth2Client,
        fileId: fileId,
        requestBody: {
          name: fileName,
          parents: [clientFolderId]
        },
        fields: 'id, name, webViewLink'
      });

      const sharedFile = copyResponse.data;

      // 3. Save to Firestore shared documents
      const docData = {
        name: sharedFile.name,
        url: sharedFile.webViewLink,
        ownerUid: coachUid || "coach",
        clientUid: clientUid,
        sharedWithEmail: clientEmail,
        sharedBy: "coach",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isDriveFile: true,
        driveFileId: sharedFile.id
      };

      await db.collection("documents").add(docData);

      // 4. Create a system message for the client
      if (coachUid) {
        await db.collection("messages").add({
          senderUid: coachUid,
          receiverUid: clientUid,
          content: `I've shared a new document with you: ${sharedFile.name}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          isRead: false,
          type: "system",
          metadata: {
            documentId: sharedFile.id,
            documentName: sharedFile.name,
            documentUrl: sharedFile.webViewLink
          }
        });
      }

      res.json({ message: "File shared successfully", document: docData });
    } catch (error: any) {
      console.error("Drive share error:", error);
      res.status(500).json({ error: error.message });
    }
  });

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
    
    if (!email || !displayName) {
      return res.status(400).json({ error: "Email and display name are required." });
    }

    // Format phone to E.164 if provided
    let formattedPhone = undefined;
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length === 10) {
        formattedPhone = `+1${digits}`;
      } else if (digits.length > 10 && phone.startsWith("+")) {
        formattedPhone = phone; // Assume already formatted
      } else if (digits.length > 10) {
        formattedPhone = `+${digits}`;
      } else {
        return res.status(400).json({ error: "Invalid phone number format. Please provide a 10-digit number or include country code (e.g., +1...)." });
      }
    }

    try {
      // Generate a temporary password
      const tempPassword = Math.random().toString(36).slice(-10) + "!";
      
      console.log(`Attempting to create user in Auth: ${email} (Project: ${admin.app().options.projectId || firebaseConfig.projectId})`);

      // Create user in Firebase Auth
      const userRecord = await admin.auth().createUser({
        email,
        displayName,
        password: tempPassword,
        phoneNumber: formattedPhone
      });

      console.log(`Successfully created Auth user: ${userRecord.uid}`);

      // Create user profile in Firestore
      await db.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        email: email.toLowerCase(),
        displayName,
        phone: formattedPhone || null,
        role: "client",
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        mustChangePassword: true
      });

      console.log(`Successfully created Firestore profile for: ${userRecord.uid}`);

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

  // --- Client: Request Appointment ---
  app.post("/api/appointments/request", async (req, res) => {
    const { uid, email, displayName, reason, desiredDateTime } = req.body;
    const coachEmail = process.env.SMTP_USER || process.env.COACH_EMAIL || "msustewart@gmail.com";

    if (!uid || !email || !reason || !desiredDateTime) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    try {
      // Save to Firestore
      await db.collection("requests").add({
        uid,
        email,
        displayName: displayName || "A client",
        reason,
        desiredDateTime,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Notify Coach
      const emailBody = `
        New Session Request from ${displayName || email}:
        
        Reason: ${reason}
        Desired Time: ${desiredDateTime}
        
        Please log in to the portal to approve or reject this request.
      `;
      await sendEmail(coachEmail, `New Session Request: ${displayName || email}`, emailBody);

      res.json({ message: "Request submitted successfully" });
    } catch (error: any) {
      console.error("Failed to submit request:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Client: Cancel Appointment ---
  app.post("/api/appointments/cancel", async (req, res) => {
    const { appointmentId, reason, clientName } = req.body;
    const coachEmail = process.env.SMTP_USER || process.env.COACH_EMAIL || "msustewart@gmail.com";

    if (!appointmentId) {
      return res.status(400).json({ error: "Appointment ID is required." });
    }

    try {
      const apptRef = db.collection("appointments").doc(appointmentId);
      const apptDoc = await apptRef.get();

      if (!apptDoc.exists) {
        return res.status(404).json({ error: "Appointment not found." });
      }

      const appt = apptDoc.data()!;
      
      // Update status in Firestore
      await apptRef.update({ status: "cancelled" });

      // Notify Coach
      const emailBody = `
        Appointment Cancelled by ${clientName || appt.clientEmail}:
        
        Session: ${appt.title}
        Original Time: ${appt.startTime}
        Reason: ${reason || "No reason provided"}
        
        The session has been marked as cancelled in the portal.
      `;
      await sendEmail(coachEmail, `Appointment Cancelled: ${appt.title}`, emailBody);

      res.json({ message: "Appointment cancelled successfully" });
    } catch (error: any) {
      console.error("Failed to cancel appointment:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Client: Reschedule Appointment ---
  app.post("/api/appointments/reschedule", async (req, res) => {
    const { appointmentId, reason, desiredDateTime, clientName } = req.body;
    const coachEmail = process.env.SMTP_USER || process.env.COACH_EMAIL || "msustewart@gmail.com";

    if (!appointmentId || !desiredDateTime) {
      return res.status(400).json({ error: "Appointment ID and desired time are required." });
    }

    try {
      const apptDoc = await db.collection("appointments").doc(appointmentId).get();
      if (!apptDoc.exists) {
        return res.status(404).json({ error: "Appointment not found." });
      }
      const appt = apptDoc.data()!;

      // Notify Coach (we don't update the appointment yet, coach must do it manually)
      const emailBody = `
        Reschedule Request from ${clientName || appt.clientEmail}:
        
        Session: ${appt.title}
        Original Time: ${appt.startTime}
        Desired New Time: ${desiredDateTime}
        Reason: ${reason || "No reason provided"}
        
        Please contact the client or update the appointment in the portal if you agree to this change.
      `;
      await sendEmail(coachEmail, `Reschedule Request: ${appt.title}`, emailBody);

      res.json({ message: "Reschedule request sent successfully" });
    } catch (error: any) {
      console.error("Failed to request reschedule:", error);
      res.status(500).json({ error: error.message });
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
