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
import { Readable } from "stream";

dotenv.config();
console.log("DEBUG: SMTP_USER is", process.env.SMTP_USER ? "SET" : "NOT SET");
console.log("DEBUG: APP_URL is", process.env.APP_URL || "NOT SET");

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

  // Force HTTPS redirect for custom domains
  app.use((req, res, next) => {
    if (process.env.NODE_ENV === "production" && req.headers["x-forwarded-proto"] !== "https") {
      // Use APP_URL if available to avoid redirecting to localhost if the proxy is misconfigured
      const host = process.env.APP_URL ? new URL(process.env.APP_URL).host : req.headers.host;
      
      // Safety check: never redirect to localhost in production
      if (host && !host.includes('localhost')) {
        return res.redirect(`https://${host}${req.url}`);
      }
    }
    next();
  });

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

  // --- Private Coach Notes Routes ---
  app.get("/api/drive/private-notes/:clientUid", async (req, res) => {
    const { clientUid } = req.params;
    try {
      const driveClient = await getDriveClient();
      const rootFolderId = process.env.GOOGLE_DRIVE_PRIVATE_NOTES_ROOT_FOLDER_ID;
      
      if (!rootFolderId) {
        return res.status(400).json({ error: "Private notes root folder ID not configured." });
      }

      // 1. Get client name for folder search
      const clientDoc = await db.collection("users").doc(clientUid).get();
      if (!clientDoc.exists) {
        return res.status(404).json({ error: "Client not found." });
      }
      const clientName = clientDoc.data()!.displayName;

      // 2. Find or create client private folder
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

      // 3. List files in the folder
      const response = await driveClient.files.list({
        auth: oauth2Client,
        q: `'${clientFolderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, webViewLink, iconLink, modifiedTime)',
        orderBy: 'modifiedTime desc'
      });

      res.json(response.data.files || []);
    } catch (error: any) {
      console.error("Private notes fetch error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/drive/private-notes/create", async (req, res) => {
    const { clientUid, title, appointmentId, coachUid } = req.body;
    
    if (!clientUid || !title) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    try {
      const driveClient = await getDriveClient();
      const rootFolderId = process.env.GOOGLE_DRIVE_PRIVATE_NOTES_ROOT_FOLDER_ID;

      if (!rootFolderId) {
        throw new Error("Private notes root folder ID not configured.");
      }

      // 1. Get client name
      const clientDoc = await db.collection("users").doc(clientUid).get();
      const clientName = clientDoc.data()!.displayName;

      // 2. Find or create client private folder
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

      // 3. Create a new Google Doc for the note
      const fileMetadata = {
        name: title,
        mimeType: 'application/vnd.google-apps.document',
        parents: [clientFolderId]
      };

      const file = await driveClient.files.create({
        auth: oauth2Client,
        requestBody: fileMetadata,
        fields: 'id, name, webViewLink'
      });

      const newNote = file.data;

      // 4. Save metadata to Firestore for searching
      const noteMetadata = {
        title: newNote.name,
        driveFileId: newNote.id,
        webViewLink: newNote.webViewLink,
        clientUid,
        coachUid: coachUid || "coach",
        appointmentId: appointmentId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const docRef = await db.collection("private_notes").add(noteMetadata);

      res.json({ id: docRef.id, ...noteMetadata });
    } catch (error: any) {
      console.error("Private note creation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/private-notes/:clientUid", async (req, res) => {
    const { clientUid } = req.params;
    try {
      const snapshot = await db.collection("private_notes")
        .where("clientUid", "==", clientUid)
        .orderBy("createdAt", "desc")
        .get();
      
      const notes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(notes);
    } catch (error: any) {
      console.error("Firestore private notes fetch error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/onboarding/submit", async (req, res) => {
    const { clientUid, onboardingData, pdfBase64 } = req.body;

    if (!clientUid || !onboardingData || !pdfBase64) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    try {
      const driveClient = await getDriveClient();
      const rootFolderId = process.env.GOOGLE_DRIVE_PRIVATE_NOTES_ROOT_FOLDER_ID;

      if (!rootFolderId) {
        throw new Error("Private notes root folder ID not configured.");
      }

      // 1. Update User Profile in Firestore
      const userRef = db.collection("users").doc(clientUid);
      await userRef.update({
        isOnboarded: true,
        phone: onboardingData.phone || "",
        preferredName: onboardingData.preferredName || "",
        age: Number(onboardingData.age) || 0,
        emergencyContactName: onboardingData.emergencyContactName || "",
        emergencyContactPhone: onboardingData.emergencyContactPhone || "",
        prompt: onboardingData.prompt || "",
        challenges: onboardingData.challenges || [],
        otherChallenge: onboardingData.otherChallenge || "",
        duration: onboardingData.duration || "",
        formalDiagnosis: onboardingData.formalDiagnosis || "",
        seeingTherapist: onboardingData.seeingTherapist || "",
        strengths: onboardingData.strengths || "",
        frequency: onboardingData.frequency || "",
        schedulingConstraints: onboardingData.schedulingConstraints || "",
        anythingElse: onboardingData.anythingElse || "",
        parentName: onboardingData.parentName || "",
        parentPhone: onboardingData.parentPhone || "",
        parentEmail: onboardingData.parentEmail || "",
        secondaryParentName: onboardingData.secondaryParentName || "",
        secondaryParentPhone: onboardingData.secondaryParentPhone || "",
        secondaryParentEmail: onboardingData.secondaryParentEmail || "",
        onboardingData: onboardingData
      });

      // 2. Find or create client private folder
      const clientDoc = await userRef.get();
      const clientName = clientDoc.data()!.displayName;

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

      // 3. Upload PDF to Drive
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
      const media = {
        mimeType: 'application/pdf',
        body: Readable.from(pdfBuffer)
      };

      const file = await driveClient.files.create({
        auth: oauth2Client,
        requestBody: {
          name: `Onboarding Intake Form - ${clientName}.pdf`,
          parents: [clientFolderId]
        },
        media: media,
        fields: 'id, name, webViewLink'
      });

      // 4. Find Coach UID
      const coachSnapshot = await db.collection("users").where("role", "==", "coach").limit(1).get();
      const coachUid = coachSnapshot.empty ? "SYSTEM" : coachSnapshot.docs[0].id;

      // 5. Save metadata to private_notes collection
      await db.collection("private_notes").add({
        title: `Onboarding Intake Form - ${clientName}`,
        driveFileId: file.data.id,
        webViewLink: file.data.webViewLink,
        clientUid: clientUid,
        coachUid: coachUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Onboarding submission error:", error);
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
    const { email, displayName, phone, password: customPassword, ...onboardingInfo } = req.body;
    
    console.log(`DEBUG: create-client request for ${email}`);
    
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
      // Check if user already exists in Auth
      let userRecord;
      let tempPassword = customPassword || null;
      try {
        userRecord = await admin.auth().getUserByEmail(email);
        console.log(`DEBUG: User already exists in Auth: ${userRecord.uid}`);
      } catch (e: any) {
        if (e.code === 'auth/user-not-found') {
          // Create new user with temporary password
          if (!tempPassword) {
            tempPassword = Math.random().toString(36).slice(-10) + "A1!";
          }
          console.log(`Attempting to create user in Auth: ${email}`);
          userRecord = await admin.auth().createUser({
            email,
            displayName,
            password: tempPassword,
            phoneNumber: formattedPhone
          });
          console.log(`DEBUG: Successfully created Auth user: ${userRecord.uid}`);
        } else {
          console.error("DEBUG: Error checking for existing user:", e);
          throw e;
        }
      }

      // Determine if onboarded based on provided info
      const hasOnboardingData = onboardingInfo && Object.keys(onboardingInfo).length > 0;

      // Create or update Firestore profile
      await db.collection("users").doc(userRecord.uid).set({
        ...onboardingInfo,
        uid: userRecord.uid,
        email: email.toLowerCase(),
        displayName,
        phone: formattedPhone || null,
        role: "client",
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        mustChangePassword: true,
        isOnboarded: hasOnboardingData
      }, { merge: true });

      console.log(`DEBUG: Successfully updated Firestore profile for: ${userRecord.uid}`);

      console.log(`DEBUG: Preparing welcome email for ${email}...`);
      const portalUrl = process.env.APP_URL || "https://portal.mrleeteaches.com";
      const emailBody = `
        Hi ${displayName},
        
        Your coach, Stewart, has created an account for you on the MrLeeTeaches Coaching Portal.
        
        You can log in at: https://portal.mrleeteaches.com
        Your temporary password is: ${tempPassword || "(Already set or previously sent)"}
        
        You will be prompted to change your password upon your first login.
        
        Take Care,
        The MrLeeTeaches Team
      `;

      console.log(`DEBUG: Calling sendEmail for ${email}`);
      await sendEmail(email, "Welcome to MrLeeTeaches Coaching Portal", emailBody);
      console.log(`DEBUG: sendEmail call completed for ${email}`);

      res.json({ 
        message: "Client created successfully", 
        uid: userRecord.uid,
        tempPassword: tempPassword 
      });
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

  app.post("/api/admin/resend-welcome", async (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: "UID is required" });

    try {
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) return res.status(404).json({ error: "User not found" });
      
      const userData = userDoc.data()!;
      const email = userData.email;
      const displayName = userData.displayName;

      console.log(`DEBUG: Resending welcome email for ${email}...`);
      const portalUrl = process.env.APP_URL || "https://portal.mrleeteaches.com";
      const emailBody = `
        Hi ${displayName},
        
        Your coach, Lee, has sent you a reminder to log in to the MrLeeTeaches Coaching Portal.
        
        You can log in at: https://portal.mrleeteaches.com
        
        If you haven't set your password yet, please use the "Forgot Password" link on the login page to set a new one.
        
        Best regards,
        MrLeeTeaches Team
      `;

      await sendEmail(email, "Welcome to MrLeeTeaches Coaching Portal (Reminder)", emailBody);
      res.json({ message: "Welcome email resent successfully" });
    } catch (error: any) {
      console.error("Failed to resend welcome email:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Admin: Update Client Profile ---
  app.post("/api/admin/update-client", async (req, res) => {
    const { uid, ...profileData } = req.body;
    
    if (!uid) {
      return res.status(400).json({ error: "Client UID is required." });
    }

    try {
      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        return res.status(404).json({ error: "Client not found." });
      }

      // If coach is providing onboarding data, set isOnboarded to true
      const updateData: any = { ...profileData };
      if (profileData.age || profileData.emergencyContactName || profileData.parentName) {
        updateData.isOnboarded = true;
      }

      await userRef.update(updateData);

      res.json({ message: "Client profile updated successfully" });
    } catch (error: any) {
      console.error("Failed to update client profile:", error);
      res.status(500).json({ error: error.message });
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
      try {
        await admin.auth().deleteUser(uid);
      } catch (authError: any) {
        // If the user is already gone from Auth, we still want to proceed with Firestore cleanup
        if (authError.code === 'auth/user-not-found') {
          console.warn(`User ${uid} not found in Firebase Auth, proceeding to delete Firestore record.`);
        } else {
          throw authError;
        }
      }

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
    secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER?.trim(),
      pass: process.env.SMTP_PASS?.replace(/\s/g, ""),
    },
    // Add a timeout to prevent hanging
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    // TLS options for better compatibility with some servers
    tls: {
      rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "false",
    },
    debug: process.env.SMTP_DEBUG === "true",
    logger: process.env.SMTP_DEBUG === "true",
  });

  // Verify connection on startup
  if (process.env.SMTP_USER) {
    console.log(`Attempting to verify SMTP connection to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} as ${process.env.SMTP_USER?.trim()}`);
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
    
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
    const fromName = process.env.SMTP_FROM_NAME || "MrLeeTeaches";
    const replyTo = process.env.SMTP_REPLY_TO || fromEmail;
    
    console.log(`Attempting to send email to ${to} from ${fromEmail} using ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
    
    try {
      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        replyTo,
        subject,
        text,
      });
      console.log(`Email successfully sent to ${to}. MessageId: ${info.messageId}`);
    } catch (error: any) {
      console.error(`CRITICAL: Failed to send email to ${to}:`, error);
      if (error.code === 'EAUTH') {
        console.error("SMTP Authentication failed. Check SMTP_USER and SMTP_PASS.");
      } else if (error.code === 'ECONNREFUSED') {
        console.error("SMTP Connection refused. Check SMTP_HOST and SMTP_PORT.");
      } else if (error.message.includes("Greeting never received")) {
        console.error("Tip: Check your SMTP_PORT and SMTP_SECURE settings. If using port 587, SMTP_SECURE must be 'false'. If using port 465, it must be 'true'.");
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
