const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { google } = require("googleapis");
const axios = require("axios");

const app = express();
app.use(cors()); // Allow React app to call this server
app.use(express.json());

// --- Socket.io Setup ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    // origin: "https://0f0c13b57495.ngrok-free.app", // React app's URL
    origin: '*',
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// --- Google Sheets Auth ---
const SHEETS_AUTH_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const CREDENTIALS_PATH = "./credentials.json";
const MAIN_SHEET_ID = "18plsCTXbOGaScL8knPnwyr31QTXtGTW5cl8AO8Fapi4"; // From sheet URL
const HISTORY_SHEET_ID = "1bzzie1HTH1LmL9R-TybdKzoTuAIhakN2D6XvXPTxNCY"; // From sheet URL

async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: SHEETS_AUTH_SCOPES,
  });
  return await auth.getClient();
}

async function getSheetsApi() {
  const authClient = await getAuthClient();
  return google.sheets({ version: "v4", auth: authClient });
}

// --- API Endpoints ---

// 1. Get main data
app.get("/api/main-data", async (req, res) => {
  try {
    const sheets = await getSheetsApi();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: MAIN_SHEET_ID,
      range: "Existing Monthly ADA Customers!A:Z", // Adjust range as needed
    });
    res.json(result.data.values || []);
  } catch (error) {
    console.error("Error fetching main data:", error);
    res.status(500).json({ error: "Failed to fetch main sheet data" });
  }
});

// 2. Get history data
app.get("/api/history-data", async (req, res) => {
  try {
    const sheets = await getSheetsApi();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: HISTORY_SHEET_ID,
      range: "Complete Master sheet!A:F", // Read upto column F
    });
    res.json(result.data.values || []);
  } catch (error) {
    console.error("Error fetching history data:", error);
    res.status(500).json({ error: "Failed to fetch history sheet data" });
  }
});

// 3. Scan URL for UserWay code
app.post("/api/scan", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const { data: pageSource } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    const isPresent =
      pageSource.includes("userway.org/widget") ||
      pageSource.includes("uwy.js");

    res.json({ isPresent });
  } catch (error) {
    console.error(`Error scanning ${url}:`, error.message);
    res.status(500).json({ isPresent: false, error: "Failed to scan URL" });
  }
});

// 4. Add entry to History sheet
app.post("/api/add-history", async (req, res) => {
  const { websiteUrl, activatedDate } = req.body;

  try {
    const sheets = await getSheetsApi();
    await sheets.spreadsheets.values.append({
      spreadsheetId: HISTORY_SHEET_ID,
      range: "Complete Master sheet!A:F", // Set range to A:F
      valueInputOption: "USER_ENTERED",
      resource: {
        // Create an array with empty strings as padding
        // [A,       B,        C,  D,  E,         F         ]
        values: [["", websiteUrl, "", "", "", activatedDate]],
      },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating history sheet:", error);
    res.status(500).json({ error: "Failed to update history sheet" });
  }
});

// --- NEW: Debounce logic for notifications ---
const notificationTimers = {}; // Stores timers, e.g., { 'B22': <timeoutId> }
const DEBOUNCE_TIME = 5000; // 5 seconds

// 5. Webhook for Google Apps Script to call
app.post("/api/sheet-update", (req, res) => {
  console.log("Received sheet update:", req.body);
  const updateInfo = req.body;
  const range = updateInfo.range; // The cell that was edited, e.g., 'B22'

  // If we can't get a range, just send the notification immediately.
  if (!range) {
    io.emit("sheet-change", updateInfo);
    return res.status(200).send("OK");
  }

  // If a timer already exists for this specific cell, clear it.
  // We're resetting the 5-second clock.
  if (notificationTimers[range]) {
    clearTimeout(notificationTimers[range]);
    console.log(`Debouncing: Cleared old timer for cell ${range}`);
  }

  // Set a new 5-second timer.
  console.log(`Setting new 5s timer for cell ${range}`);
  notificationTimers[range] = setTimeout(() => {
    // This code runs *after* 5 seconds of no new edits to this cell.
    console.log(`Timer Fired: Sending update for ${range}`);

    // Send the *last* update we received for this cell to all clients.
    io.emit("sheet-change", updateInfo);

    // Clean up the timer from our object.
    delete notificationTimers[range];
  }, DEBOUNCE_TIME);

  // Immediately tell Google "OK" so it doesn't resend the request.
  res.status(200).send("OK");
});

// --- Start Server ---
const PORT = 3001; // Backend runs on a different port
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
