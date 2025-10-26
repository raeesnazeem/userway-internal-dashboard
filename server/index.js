// const express = require("express");
// const http = require("http");
// const { Server } = require("socket.io");
// const cors = require("cors");
// const { google } = require("googleapis");
// const axios = require("axios");

// const app = express();
// app.use(cors()); // Allow React app to call this server
// app.use(express.json());

// // --- Socket.io Setup ---
// const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     // origin: "https://0f0c13b57495.ngrok-free.app", // React app's URL
//     origin: '*',
//     methods: ["GET", "POST"],
//   },
// });

// io.on("connection", (socket) => {
//   console.log("A user connected:", socket.id);
//   socket.on("disconnect", () => {
//     console.log("User disconnected:", socket.id);
//   });
// });

// // --- Google Sheets Auth ---
// const SHEETS_AUTH_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
// const CREDENTIALS_PATH = "./credentials.json";
// const MAIN_SHEET_ID = "" From sheet URL
// const HISTORY_SHEET_ID = ""

// async function getAuthClient() {
//   const auth = new google.auth.GoogleAuth({
//     keyFile: CREDENTIALS_PATH,
//     scopes: SHEETS_AUTH_SCOPES,
//   });
//   return await auth.getClient();
// }

// async function getSheetsApi() {
//   const authClient = await getAuthClient();
//   return google.sheets({ version: "v4", auth: authClient });
// }

// // --- API Endpoints ---

// // 1. Get main data
// app.get("/api/main-data", async (req, res) => {
//   try {
//     const sheets = await getSheetsApi();
//     const result = await sheets.spreadsheets.values.get({
//       spreadsheetId: MAIN_SHEET_ID,
//       range: "Existing Monthly ADA Customers!A:Z", // Adjust range as needed
//     });
//     res.json(result.data.values || []);
//   } catch (error) {
//     console.error("Error fetching main data:", error);
//     res.status(500).json({ error: "Failed to fetch main sheet data" });
//   }
// });

// // 2. Get history data
// app.get("/api/history-data", async (req, res) => {
//   try {
//     const sheets = await getSheetsApi();
//     const result = await sheets.spreadsheets.values.get({
//       spreadsheetId: HISTORY_SHEET_ID,
//       range: "Complete Master sheet!A:F", // Read upto column F
//     });
//     res.json(result.data.values || []);
//   } catch (error) {
//     console.error("Error fetching history data:", error);
//     res.status(500).json({ error: "Failed to fetch history sheet data" });
//   }
// });

// // 3. Scan URL for UserWay code
// app.post("/api/scan", async (req, res) => {
//   const { url } = req.body;
//   if (!url) {
//     return res.status(400).json({ error: "URL is required" });
//   }

//   try {
//     const { data: pageSource } = await axios.get(url, {
//       headers: {
//         "User-Agent":
//           "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
//       },
//     });

//     const isPresent =
//       pageSource.includes("userway.org/widget") ||
//       pageSource.includes("uwy.js");

//     res.json({ isPresent });
//   } catch (error) {
//     console.error(`Error scanning ${url}:`, error.message);
//     res.status(500).json({ isPresent: false, error: "Failed to scan URL" });
//   }
// });

// // 4. Add entry to History sheet
// app.post("/api/add-history", async (req, res) => {
//   const { websiteUrl, activatedDate } = req.body;

//   try {
//     const sheets = await getSheetsApi();
//     await sheets.spreadsheets.values.append({
//       spreadsheetId: HISTORY_SHEET_ID,
//       range: "Complete Master sheet!A:F", // Set range to A:F
//       valueInputOption: "USER_ENTERED",
//       resource: {
//         // Create an array with empty strings as padding
//         // [A,       B,        C,  D,  E,         F         ]
//         values: [["", websiteUrl, "", "", "", activatedDate]],
//       },
//     });
//     res.json({ success: true });
//   } catch (error) {
//     console.error("Error updating history sheet:", error);
//     res.status(500).json({ error: "Failed to update history sheet" });
//   }
// });

// // --- NEW: Debounce logic for notifications ---
// const notificationTimers = {}; // Stores timers, e.g., { 'B22': <timeoutId> }
// const DEBOUNCE_TIME = 5000; // 5 seconds

// // 5. Webhook for Google Apps Script to call
// app.post("/api/sheet-update", (req, res) => {
//   console.log("Received sheet update:", req.body);
//   const updateInfo = req.body;
//   const range = updateInfo.range; // The cell that was edited, e.g., 'B22'

//   // If we can't get a range, just send the notification immediately.
//   if (!range) {
//     io.emit("sheet-change", updateInfo);
//     return res.status(200).send("OK");
//   }

//   // If a timer already exists for this specific cell, clear it.
//   // We're resetting the 5-second clock.
//   if (notificationTimers[range]) {
//     clearTimeout(notificationTimers[range]);
//     console.log(`Debouncing: Cleared old timer for cell ${range}`);
//   }

//   // Set a new 5-second timer.
//   console.log(`Setting new 5s timer for cell ${range}`);
//   notificationTimers[range] = setTimeout(() => {
//     // This code runs *after* 5 seconds of no new edits to this cell.
//     console.log(`Timer Fired: Sending update for ${range}`);

//     // Send the *last* update we received for this cell to all clients.
//     io.emit("sheet-change", updateInfo);

//     // Clean up the timer from our object.
//     delete notificationTimers[range];
//   }, DEBOUNCE_TIME);

//   // Immediately tell Google "OK" so it doesn't resend the request.
//   res.status(200).send("OK");
// });

// // --- Start Server ---
// const PORT = 3001; // Backend runs on a different port
// server.listen(PORT, () => {
//   console.log(`🚀 Server listening on http://localhost:${PORT}`);
// });

//==================================================
//==================================================
//=====================================================

// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');
// const { google } = require('googleapis');
// const axios = require('axios');
// const cheerio = require('cheerio'); // <-- NEW: For scraping Basecamp

// const app = express();
// app.use(cors());
// app.use(express.json());

// // --- Socket.io Setup ---
// const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: '*', // Allow all origins
//     methods: ['GET', 'POST'],
//   },
// });

// io.on('connection', (socket) => {
//   console.log('A user connected:', socket.id);
//   socket.on('disconnect', () => {
//     console.log('User disconnected:', socket.id);
//   });
// });

// // --- Google Sheets Auth ---
// const SHEETS_AUTH_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
// const CREDENTIALS_PATH = './credentials.json';

// // --- IMPORTANT: ADD ALL SHEET IDs HERE ---
// const MAIN_SHEET_ID = '18plsCTXbOGaScL8knPnwyr31QTXtGTW5cl8AO8Fapi4'; // MASTER sheet for fetching project names
// const HISTORY_SHEET_ID = '1RNdfMTFNh1-it6IfYeATVRZM4FpTS9rB1FhhOCRsP1M'; // ADA Pro sheet to log history
// const URL_LOOKUP_SHEET_ID = '1rta6P9XNo1sEy3IWE1L5wFUxxgURJXiyMIlTCBo0GI0'; // ADA duplicate sheet to look up URLs corresponding to projects

// async function getAuthClient() {
//   const auth = new google.auth.GoogleAuth({
//     keyFile: CREDENTIALS_PATH,
//     scopes: SHEETS_AUTH_SCOPES,
//   });
//   return await auth.getClient();
// }

// async function getSheetsApi() {
//   const authClient = await getAuthClient();
//   return google.sheets({ version: 'v4', auth: authClient });
// }

// // --- API Endpoints ---

// // HELPER FUNCTION: Generic function to get sheet data
// async function fetchSheetData(spreadsheetId, range) {
//   try {
//     const sheets = await getSheetsApi();
//     const result = await sheets.spreadsheets.values.get({
//       spreadsheetId,
//       range,
//     });
//     return result.data.values || [];
//   } catch (error) {
//     console.error(
//       `Error fetching sheet ${spreadsheetId} range ${range}:`,
//       error.message
//     );
//     throw new Error('Failed to fetch sheet data');
//   }
// }

// //  Get data from the "Existing ADA Customers" tab
// app.get('/api/existing-data', async (req, res) => {
//   try {
//     const data = await fetchSheetData(
//       MAIN_SHEET_ID,
//       "'Existing Monthly ADA Customers'!A:Z"
//     );
//     res.json(data);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // Get data from the "New ADA customers" tab
// app.get('/api/new-data', async (req, res) => {
//   try {
//     const data = await fetchSheetData(
//       MAIN_SHEET_ID,
//       "'New Monthly ADA Customers'!A:Z"
//     );
//     res.json(data);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // Get URL data from the ADA Duplicate sheet
// app.get('/api/url-data', async (req, res) => {
//   try {
//     const data = await fetchSheetData(URL_LOOKUP_SHEET_ID, 'Sheet1!A:Z');
//     res.json(data);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // 2. Get history data from ADA Pro sheet
// app.get('/api/history-data', async (req, res) => {
//   try {
//     const data = await fetchSheetData(
//       HISTORY_SHEET_ID,
//       'Complete Master sheet!A:G'
//     );
//     res.json(data);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // 3. Scan URL
// app.post('/api/scan', async (req, res) => {
//   const { url } = req.body;
//   if (!url) {
//     return res.status(400).json({ error: 'URL is required' });
//   }

//   try {
//     const { data: pageSource } = await axios.get(url, {
//       headers: {
//         'User-Agent':
//           'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
//       },
//     });

//     const basicScript = 'data-account="y0juzG0O0x"';
//     const proScript = 'data-account="062WMb6Yf6"';
//     const hasWidget =
//       pageSource.includes('userway.org/widget.js') || // Check for widget.js
//       pageSource.includes('userway.org/widget'); // Or other widget calls

//     const hasBasic = pageSource.includes(basicScript);
//     const hasPro = pageSource.includes(proScript);

//     if (hasBasic && hasPro) {
//       // Both scripts found, this is an error
//       res.json({ isPresent: false, status: 'ID Mismatch' });
//     } else if (hasBasic) {
//       // Basic script found
//       res.json({ isPresent: true, status: 'Basic' });
//     } else if (hasPro) {
//       // Pro script found
//       res.json({ isPresent: true, status: 'Pro' });
//     } else if (hasWidget) {
//       // Widget found, but with a *different* ID
//       res.json({ isPresent: false, status: 'ID Mismatch' });
//     } else {
//       // No widget found at all
//       res.json({ isPresent: false, status: 'Not Found' });
//     }
//   } catch (error) {
//     console.error(`Error scanning ${url}:`, error.message);
//     res.status(500).json({ isPresent: false, status: 'Scan Failed' });
//   }
// });

// // 4. Add entry to History sheet
// app.post('/api/add-history', async (req, res) => {
//   const { websiteUrl, activatedDate } = req.body;

//   try {
//     const sheets = await getSheetsApi();
//     await sheets.spreadsheets.values.append({
//       spreadsheetId: HISTORY_SHEET_ID,
//       range: 'Complete Master sheet!A:F',
//       valueInputOption: 'USER_ENTERED',
//       resource: {
//         // [A,       B,        C,  D,  E,         F         ]
//         values: [['', websiteUrl, '', '', '', activatedDate]],
//       },
//     });
//     res.json({ success: true });
//   } catch (error) {
//     console.error('Error updating history sheet:', error);
//     res.status(500).json({ error: 'Failed to update history sheet' });
//   }
// });

// // --- Debounce logic for notifications ---
// const notificationTimers = {};
// const DEBOUNCE_TIME = 5000; // 5 seconds

// // 5. Webhook for Google Apps Script to call
// app.post('/api/sheet-update', (req, res) => {
//   console.log('Received sheet update:', req.body);
//   const updateInfo = req.body;
//   const range = updateInfo.range;

//   if (!range) {
//     io.emit('sheet-change', updateInfo);
//     return res.status(200).send('OK');
//   }

//   if (notificationTimers[range]) {
//     clearTimeout(notificationTimers[range]);
//     console.log(`Debouncing: Cleared old timer for cell ${range}`);
//   }

//   console.log(`Setting new 5s timer for cell ${range}`);
//   notificationTimers[range] = setTimeout(() => {
//     console.log(`Timer Fired: Sending update for ${range}`);
//     io.emit('sheet-change', updateInfo);
//     delete notificationTimers[range];
//   }, DEBOUNCE_TIME);

//   res.status(200).send('OK');
// });

// // --- NEW: Basecamp Scraping Endpoint ---
// app.post('/api/basecamp-link', async (req, res) => {
//   const { projectName } = req.body;
//   if (!projectName) {
//     return res.status(400).json({ error: 'Project Name is required' });
//   }

//   const directoryUrl = 'https://3.basecamp.com/4023059/projects/directory';

//   // --- WARNING! ---
//   // This will ONLY work if your server can authenticate.
//   // A browser being logged in does NOT log in your server.
//   // You must copy your browser's "Cookie" header for basecamp.com
//   // and paste it into the 'Cookie' field below.

//   try {
//     const { data: pageSource } = await axios.get(directoryUrl, {
//       headers: {
//         'User-Agent':
//           'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
//         // 'Cookie': 'PASTE_YOUR_BASECAMP_COOKIE_STRING_HERE' // <--- ADD YOUR COOKIE
//       },
//     });

//     const $ = cheerio.load(pageSource);
//     let foundLink = null;

//     // Find an <a> tag whose 'title' attribute CONTAINS the project name
//     $('a.project-list__link').each((i, el) => {
//       const title = $(el).attr('title');
//       // Use includes() for partial matching
//       if (title && title.includes(projectName)) {
//         const href = $(el).attr('href'); // e.g., /4023059/projects/32952220
//         if (href) {
//           foundLink = `https://3.basecamp.com${href}`;
//           return false; // Stop the .each() loop
//         }
//       }
//     });

//     if (foundLink) {
//       res.json({ link: foundLink });
//     } else {
//       res.status(404).json({ error: 'Link not found in directory' });
//     }
//   } catch (error) {
//     console.error(`Failed to scrape Basecamp:`, error.message);
//     res
//       .status(500)
//       .json({ error: 'Failed to scrape Basecamp. Is it public or is your cookie valid?' });
//   }
// });

// // --- Start Server ---
// const PORT = 3001;
// server.listen(PORT, () => {
//   console.log(`🚀 Server listening on http://localhost:${PORT}`);
// });

const path = require("path");
const dotenv = require("dotenv");
const fs = require("fs");


dotenv.config({ path: path.resolve(__dirname, "./.env") });

const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")
const { google } = require("googleapis")
const axios = require("axios")
const cheerio = require("cheerio")
const puppeteer = require("puppeteer")



// Resolve to absolute path based on the location of index.js
const CREDENTIALS_PATH = path.resolve(__dirname, process.env.CREDENTIALS_PATH || "credentials.json");

// Validate early
if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error(`❌ FATAL: Credentials file not found at ${CREDENTIALS_PATH}`);
  process.exit(1);
}
const app = express()
app.use(cors())
app.use(express.json())

// --- Socket.io Setup ---
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins
    methods: ["GET", "POST"],
  },
})

const stopFlags = {}

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id)

  // Initialize stop flag for this user
  stopFlags[socket.id] = false

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id)
    // Clean up stop flag
    delete stopFlags[socket.id]
  })

  // --- NEW: Listen for stop signal ---
  socket.on("stop-bulk-inject", () => {
    console.log(`Received stop signal from ${socket.id}`)
    logToClient(`STOP signal received. Finishing current site and stopping...`)
    stopFlags[socket.id] = true
  })

  // --- START: NEW BULK INJECT LOGIC ---
  socket.on("start-bulk-inject", async (options) => {
    // --- Reset stop flag for this run ---
    stopFlags[socket.id] = false

    // --- Configuration from user script ---
    const config = {
      sheetId: process.env.BULK_INJECT_SHEET_ID,
      concurrency: 1,
      headless: true,
      credentials: CREDENTIALS_PATH,
      ...options,
    }

    const HEADLESS =
      config.headless === "false"
        ? false
        : config.headless === "true"
        ? true
        : config.headless

    // --- UserWay Scripts ---
    const USERWAY_ACCOUNT_ID = process.env.USERWAY_ACCOUNT_ID
    const ELEMENTOR_SCRIPT = `<script src="https://cdn.userway.org/widget.js" data-account="${USERWAY_ACCOUNT_ID}"></script>`

    // Using a template literal to inject the account ID
    const WP_BAKERY_SNIPPET = `
(function(d){
var s = d.createElement("script");
/* uncomment the following line to override default position*/
/* s.setAttribute("data-position", 3);*/
/* uncomment the following line to override default size (values: small, large)*/
/* s.setAttribute("data-size", "small");*/
/* uncomment the following line to override default language (e.g., fr, de, es, he, nl, etc.)*/
/* s.setAttribute("data-language", "language");*/
/* uncomment the following line to override color set via widget (e.g., #053f67)*/
/* s.setAttribute("data-color", "#053e67");*/
/* uncomment the following line to override type set via widget (1=person, 2=chair, 3=eye, 4=text)*/
/* s.setAttribute("data-type", "1");*/
/* s.setAttribute("data-statement_text:", "Our Accessibility Statement");*/
/* s.setAttribute("data-statement_url", "http://www.example.com/accessibility")";*/
/* uncomment the following line to override support on mobile devices*/
/* s.setAttribute("data-mobile", true);*/
/* uncomment the following line to set custom trigger action for accessibility menu*/
/* s.setAttribute("data-trigger", "triggerId")*/
/* uncomment the following line to override widget's z-index property*/
/* s.setAttribute("data-z-index", 10001);*/
/* uncomment the following line to enable Live site translations (e.g., fr, de, es, he, nl, etc.)*/
/* s.setAttribute("data-site-language", "null");*/
s.setAttribute("data-widget_layout", "full")
s.setAttribute("data-account", "${USERWAY_ACCOUNT_ID}");
s.setAttribute("src", "https://cdn.userway.org/widget.js");
(d.body || d.head).appendChild(s);
})(document)
`

    // Helper to log to both server console and client UI via socket
    const logToClient = (message) => {
      console.log(message)
      // Emit to the specific user who started the job
      socket.emit("bulk-inject-log", message)
    }

    logToClient(
      `Bulk inject started. Concurrency: ${config.concurrency}, Headless: ${HEADLESS}`
    )
    if (!config.sheetId) {
      logToClient(
        "ERROR: sheetId is not set. Please update index.js or send from client."
      )
      return
    }
    if (!fs.existsSync(config.credentials)) {
      logToClient(`ERROR: Credentials file not found at ${config.credentials}.`)
      logToClient(
        "Make sure credentials.json is in the same directory as index.js"
      )
      return
    }

    // ---------- Google Sheets helper ----------
    async function getSitesFromSheet(sheetId, range, credsFile) {
      logToClient("Authenticating with Google Sheets...")
      const auth = new google.auth.GoogleAuth({
        keyFile: credsFile,
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      })

      const sheets = google.sheets({ version: "v4", auth })
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
      })
      const rows = res.data.values
      if (!rows || rows.length === 0) throw new Error("No data found in sheet")

      logToClient(`Found ${rows.length} sites in sheet.`)
      return rows.map((r) => ({
        username: "support.loginuser@growth99.net", // --- MODIFIED: Hardcoded username
        url: r[2], // Column D
        password: r[3], // Column E
      }))
    }

    // ---------- Puppeteer helpers ----------
    function sleep(ms) {
      return new Promise((r) =>
        setTimeout(r, ms + Math.floor(Math.random() * 500))
      )
    }

    async function detectBuilder(page, log) {
      log("Detecting builder...")
      // Check for Elementor menu
      await page.waitForSelector("body", { timeout: 10000 })
      const hasElementor = await page.$("#ghost-admin-bar-elementor_edit_page")
      if (hasElementor) {
        log("Elementor detected.")
        return "elementor"
      }

      // Check for WPBakery/Visual Composer menu
      const hasWPB = await page.$("#ghost-admin-bar-js_composer-front-editor")
      if (hasWPB) {
        log("WPBakery detected.")
        return "wpbakery"
      }

      log("Builder not detected on front-end. Will check admin menu.")
      const adminElementor = await page.$("a[href*='admin.php?page=elementor']")
      if (adminElementor) {
        log("Elementor detected in admin.")
        return "elementor"
      }

      const adminWPB = await page.$("a[href*='admin.php?page=vc-general']")
      if (adminWPB) {
        log("WPBakery detected in admin.")
        return "wpbakery"
      }

      log("Could not detect Elementor or WPBakery.")
      return "unknown"
    }

    // --- NEW: Elementor Install Function ---
    const installElementor = async (page, script, log) => {
      log("Navigating to Elementor > Custom Code")
      await page.goto(
        page.url().split("/ghost-admin/")[0] +
          "/ghost-admin/edit.php?post_type=elementor_snippet",
        { waitUntil: "networkidle2" }
      )
      await sleep(1000)

      log('Clicking "Add New"')
      await page.click(
        'a.page-title-action[href*="post-new.php?post_type=elementor_snippet"]'
      )
      await page.waitForNavigation({ waitUntil: "networkidle2" })
      await sleep(1000)

      // --- Verification Step ---
      log("Verifying Elementor Pro 'Custom Code' page...")
      const isCorrectPage = await page.$("body.post-type-elementor_snippet")
      if (!isCorrectPage) {
        log(
          "Elementor Pro 'Custom Code' feature not found. This site may have the free version."
        )
        throw new Error("Elementor Pro 'Custom Code' feature not found.")
      }
      log("Elementor Pro page verified.")
      // --- End Verification ---

      log('Entering title: "UserWay Accessibility"')
      await page.type("#title", "UserWay Accessibility")

      // --- Wait for the correct CodeMirror editor to load ---
      const editorSelector = ".elementor-custom-code-codemirror .CodeMirror"
      log("Waiting for Elementor Pro Code Editor to load...")
      try {
        await page.waitForSelector(editorSelector, {
          visible: true,
          timeout: 15000,
        })
      } catch (e) {
        log("ERROR: Timed out waiting for CodeMirror editor.")
        throw new Error("CodeMirror editor not found on page.")
      }
      log("Code Editor loaded.")
      // --- End modification ---

      log("Checking for existing UserWay script...")
      const existingCode = await page.evaluate((sel) => {
        const cm = document.querySelector(sel).CodeMirror
        return cm.getValue()
      }, editorSelector)

      if (
        existingCode.includes(USERWAY_ACCOUNT_ID) ||
        existingCode.includes("userway.org/widget.js")
      ) {
        log("SKIPPING: UserWay script already found in Elementor Custom Code.")
        return
      }

      log("Pasting UserWay script...")
      await page.evaluate(
        (script, sel) => {
          const cm = document.querySelector(sel).CodeMirror
          cm.setValue(script)
        },
        script,
        editorSelector
      )

      // --- REFINED PUBLISH FLOW ---

      log('Clicking "Publish" (WordPress button)')
      // Click the main WordPress publish button as you identified
      await page.click("#publish")

      // Wait for the new modal you provided
      log("Waiting for Elementor 'Publish Settings' modal...")
      await page.waitForSelector(".eps-modal", {
        visible: true,
        timeout: 10000,
      })
      log("Publish modal appeared.")

      try {
        // Step 1: Select "Entire site"
        // Targets the <select> within the wrapper you found
        const selectSelector = ".e-site-editor-conditions__input-wrapper select"
        log("Waiting for condition <select> element...")
        await page.waitForSelector(selectSelector, { visible: true })

        log("Setting condition to 'Entire site' (general)...")
        await page.select(selectSelector, "general")
        await sleep(500) // Small pause for any JS to react

        // Step 2: Find and click "Save & Close"
        // Targets the button in the footer you identified
        const saveButtonSelector =
          ".e-site-editor-conditions__footer .eps-button"
        log('Clicking "Save & Close"...')

        // This click causes navigation, so wrap in Promise.all
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle2" }),
          page.click(saveButtonSelector),
        ])
      } catch (e) {
        log(`ERROR setting condition: ${e.message}`)
        throw new Error(
          "Failed to set condition or click 'Save & Close' in modal."
        )
      }
      // --- END REFINED FLOW ---

      await sleep(2000)
      log("Elementor script installed successfully.")
    }

    // --- NEW: WPBakery Install Function ---
    const installWPBakery = async (page, snippet, log) => {
      log("Navigating to WPBakery Page Builder > General Settings")
      await page.goto(
        page.url().split("/ghost-admin/")[0] +
          "/ghost-admin/admin.php?page=vc-general",
        { waitUntil: "networkidle2" }
      )
      await sleep(1000)

      const footerJsSelector = 'textarea[name="wpb_js_footer"]'
      log("Checking for existing script in Custom JS (Footer)...")
      await page.waitForSelector(footerJsSelector, { timeout: 10000 })

      const existingJs = await page.evaluate((sel) => {
        return document.querySelector(sel).value
      }, footerJsSelector)

      if (existingJs.includes(USERWAY_ACCOUNT_ID)) {
        log("SKIPPING: UserWay Account ID already found in WPBakery Custom JS.")
        return
      }

      log("Account ID not found. Appending script...")
      const newJs = existingJs + "\n\n" + snippet

      await page.evaluate(
        (sel, text) => {
          document.querySelector(sel).value = text
        },
        footerJsSelector,
        newJs
      )

      log('Clicking "Save Changes"')
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2" }),
        page.click('input[name="save_changes_vc-general"]'),
      ])
      await sleep(1000)
      log("WPBakery script installed successfully.")
    }

    // --- NEW: Helper functions for Puppeteer ---

    // ---------- Main worker ----------
    async function processSite(browser, site, index) {
      const { url, username, password } = site
      const debugPrefix = `[${index}] ${url.replace(/^https?:\/\//, "")}`

      // This 'log' function is local to processSite
      const log = (...args) => {
        logToClient(debugPrefix + " - " + args.join(" "))
      }

      const page = await browser.newPage()
      page.setDefaultNavigationTimeout(60000)

      try {
        // --- STOP CHECK ---
        if (stopFlags[socket.id]) throw new Error("Process stopped by user")

        log("Starting")
        const base = url.startsWith("http")
          ? url.replace(/\/+$/, "")
          : `https://${url.replace(/\/+$/, "")}`
        // --- MODIFIED: Corrected login page URL ---
        const loginPage = `${base}/ghost-login`

        log(`Navigating to ${loginPage}`)
        await page.goto(loginPage, { waitUntil: "domcontentloaded" })
        await sleep(500)

        // --- STOP CHECK ---
        if (stopFlags[socket.id]) throw new Error("Process stopped by user")

        log("Attempting login...")
        const userSel = 'input#user_login, input[name="log"]'
        const passSel = 'input#user_pass, input[name="pwd"]'
        const btnSel = "input#wp-submit, button#wp-submit"
        await page.waitForSelector(userSel, { visible: true, timeout: 10000 })
        await page.type(userSel, username, { delay: 50 })
        await page.type(passSel, password, { delay: 50 })
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle2" }),
          page.click(btnSel),
        ])
        await sleep(500)

        // Check for login failure
        const loginError = await page.$("#login_error")
        if (loginError) {
          throw new Error("Login failed. Check credentials.")
        }
        log("Login successful.")

        // --- STOP CHECK ---
        if (stopFlags[socket.id]) throw new Error("Process stopped by user")

        const builder = await detectBuilder(page, log)
        log("Detected builder:", builder)

        if (builder === "elementor")
          await installElementor(page, ELEMENTOR_SCRIPT, log)
        else if (builder === "wpbakery")
          await installWPBakery(page, WP_BAKERY_SNIPPET, log)
        else log("Builder unknown or not supported. Skipping.")

        await page.close()
        log("Completed")
        return { url, status: "ok", builder }
      } catch (err) {
        console.error(debugPrefix, "ERROR:", err.message) // Log full error to server console
        logToClient(debugPrefix + " ERROR: " + err.message) // Send clean error to client
        try {
          await page.screenshot({
            path: `error-${index}-${url.replace(/[^a-zA-Z0-9]/g, "_")}.png`,
            fullPage: true,
          })
        } catch (e) {}
        await page.close()
        return { url, status: "error", error: err.message }
      }
    }

    // ---------- Orchestrator ----------
    try {
      const sites = await getSitesFromSheet(
        config.sheetId,
        config.range,
        config.credentials
      )

      logToClient("Launching Puppeteer browser...")
      const browser = await puppeteer.launch({
        headless: HEADLESS,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        defaultViewport: { width: 1200, height: 900 },
      })

      const results = []
      const queue = sites.slice()
      let index = 0

      logToClient(`Starting worker pool with ${config.concurrency} workers...`)
      const workers = new Array(config.concurrency).fill(null).map(async () => {
        while (queue.length) {
          // --- STOP CHECK (before pulling from queue) ---
          if (stopFlags[socket.id]) {
            logToClient("Worker stopping due to user request.")
            break
          }

          const site = queue.shift()
          if (!site.url || !site.username || !site.password) {
            logToClient(
              `[${
                index + 1
              }] Skipping row: Data is incomplete (URL, user, or pass is missing).`
            )
            index += 1
            continue
          }
          index += 1
          const result = await processSite(browser, site, index)
          results.push(result)
          await sleep(1000) // Wait 1s between sites per worker
        }
      })

      await Promise.all(workers)
      await browser.close()

      const resultsFilename = `results-${Date.now()}.json`
      fs.writeFileSync(resultsFilename, JSON.stringify(results, null, 2))

      if (stopFlags[socket.id]) {
        logToClient(
          `Process stopped by user. Results so far saved to server as ${resultsFilename}`
        )
      } else {
        logToClient(`All done. Results saved to server as ${resultsFilename}`)
      }
    } catch (err) {
      console.error("Orchestrator error:", err.message, err.stack)
      logToClient("FATAL ERROR: " + err.message)
    }
  })
  // --- END: NEW BULK INJECT LOGIC ---
})

const SHEETS_AUTH_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


// --- Sheet IDs for API Endpoints ---
const MAIN_SHEET_ID = process.env.MAIN_SHEET_ID
const HISTORY_SHEET_ID = process.env.HISTORY_SHEET_ID
const URL_LOOKUP_SHEET_ID = process.env.URL_LOOKUP_SHEET_ID





// --- UserWay Account ID (for /api/scan) ---
const USERWAY_ACCOUNT_ID = process.env.USERWAY_ACCOUNT_ID

if (!MAIN_SHEET_ID) console.warn("⚠️ MAIN_SHEET_ID not found in .env");
if (!USERWAY_ACCOUNT_ID) console.warn("⚠️ USERWAY_ACCOUNT_ID not found in .env");

async function getAuthClient() {
  if (!CREDENTIALS_PATH || !fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`Credentials file missing at ${CREDENTIALS_PATH}`)
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: SHEETS_AUTH_SCOPES,
  })
  return auth.getClient()
}

async function getSheetsApi() {
  const authClient = await getAuthClient()
  return google.sheets({ version: "v4", auth: authClient })
}

// HELPER FUNCTION: Generic function to get sheet data
async function fetchSheetData(spreadsheetId, range) {
  try {
    const sheets = await getSheetsApi()
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    })
    return result.data.values || []
  } catch (error) {
    console.error(
      `Error fetching sheet ${spreadsheetId} range ${range}:`,
      error.message
    )
    throw new Error("Failed to fetch sheet data")
  }
}

//  Get data from the "Existing ADA Customers" tab
app.get("/api/existing-data", async (req, res) => {
  try {
    const data = await fetchSheetData(
      MAIN_SHEET_ID,
      "'Existing Monthly ADA Customers'!A:Z"
    )
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get data from the "New ADA customers" tab
app.get("/api/new-data", async (req, res) => {
  try {
    const data = await fetchSheetData(
      MAIN_SHEET_ID,
      "'New Monthly ADA Customers'!A:Z"
    )
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get URL data from the ADA Duplicate sheet
app.get("/api/url-data", async (req, res) => {
  try {
    const data = await fetchSheetData(URL_LOOKUP_SHEET_ID, "Sheet1!A:Z")
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 2. Get history data from ADA Pro sheet
app.get("/api/history-data", async (req, res) => {
  try {
    const data = await fetchSheetData(
      HISTORY_SHEET_ID,
      "Complete Master sheet!A:G"
    )
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 3. Scan URL
app.post("/api/scan", async (req, res) => {
  const { url } = req.body
  if (!url) {
    return res.status(400).json({ error: "URL is required" })
  }

  try {
    const { data: pageSource } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      timeout: 10000, // Add timeout
    })

    const basicScript = 'data-account="y0juzG0O0x"'
    // Use the same account ID from the injector
    const proScript = `data-account="${USERWAY_ACCOUNT_ID}"`

    const hasWidget =
      pageSource.includes("userway.org/widget.js") ||
      pageSource.includes("userway.org/widget")

    const hasBasic = pageSource.includes(basicScript)
    const hasPro = pageSource.includes(proScript)

    if (hasBasic && hasPro) {
      res.json({ isPresent: false, status: "ID Mismatch" })
    } else if (hasBasic) {
      res.json({ isPresent: true, status: "Basic" })
    } else if (hasPro) {
      res.json({ isPresent: true, status: "Pro" })
    } else if (hasWidget) {
      res.json({ isPresent: false, status: "ID Mismatch" })
    } else {
      res.json({ isPresent: false, status: "Not Found" })
    }
  } catch (error) {
    console.error(`Error scanning ${url}:`, error.message)
    res.status(500).json({ isPresent: false, status: "Scan Failed" })
  }
})

// 4. Add entry to History sheet
app.post("/api/add-history", async (req, res) => {
  const { websiteUrl, activatedDate } = req.body

  try {
    const sheets = await getSheetsApi()
    await sheets.spreadsheets.values.append({
      spreadsheetId: HISTORY_SHEET_ID,
      range: "Complete Master sheet!A:F",
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [["", websiteUrl, "", "", "", activatedDate]],
      },
    })
    res.json({ success: true })
  } catch (error) {
    console.error("Error updating history sheet:", error)
    res.status(500).json({ error: "Failed to update history sheet" })
  }
})

// --- Debounce logic for notifications ---
const notificationTimers = {}
const DEBOUNCE_TIME = 5000 // 5 seconds

// 5. Webhook for Google Apps Script to call
app.post("/api/sheet-update", (req, res) => {
  console.log("Received sheet update:", req.body)
  const updateInfo = req.body
  const range = updateInfo.range

  if (!range) {
    io.emit("sheet-change", updateInfo)
    return res.status(200).send("OK")
  }

  if (notificationTimers[range]) {
    clearTimeout(notificationTimers[range])
    console.log(`Debouncing: Cleared old timer for cell ${range}`)
  }

  console.log(`Setting new 5s timer for cell ${range}`)
  notificationTimers[range] = setTimeout(() => {
    console.log(`Timer Fired: Sending update for ${range}`)
    io.emit("sheet-change", updateInfo)
    delete notificationTimers[range]
  }, DEBOUNCE_TIME)

  res.status(200).send("OK")
})

// --- NEW: Basecamp Scraping Endpoint ---
app.post("/api/basecamp-link", async (req, res) => {
  const { projectName } = req.body
  if (!projectName) {
    return res.status(400).json({ error: "Project Name is required" })
  }

  const directoryUrl = process.env.BASECAMP_DIRECTORY_URL

  try {
    const { data: pageSource } = await axios.get(directoryUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        // 'Cookie': 'PASTE_YOUR_BASECAMP_COOKIE_STRING_HERE' // <--- ADD YOUR COOKIE
      },
    })

    const $ = cheerio.load(pageSource)
    let foundLink = null

    $("a.project-list__link").each((i, el) => {
      const title = $(el).attr("title")
      if (title && title.includes(projectName)) {
        const href = $(el).attr("href")
        if (href) {
          foundLink = `https://3.basecamp.com${href}`
          return false
        }
      }
    })

    if (foundLink) {
      res.json({ link: foundLink })
    } else {
      res.status(404).json({ error: "Link not found in directory" })
    }
  } catch (error) {
    console.error(`Failed to scrape Basecamp:`, error.message)
    res.status(500).json({
      error: "Failed to scrape Basecamp. Is it public or is your cookie valid?",
    })
  }
})

// --- Start Server ---
const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`)
})
