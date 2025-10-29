const path = require("path")
const dotenv = require("dotenv")
const fs = require("fs")

dotenv.config({ path: path.resolve(__dirname, "./.env") })

const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")
const { google } = require("googleapis")
const axios = require("axios")
const cheerio = require("cheerio")
const puppeteer = require("puppeteer")

// Resolve to absolute path based on the location of index.js
const CREDENTIALS_PATH = path.resolve(
  __dirname,
  process.env.CREDENTIALS_PATH || "credentials.json"
)

// Validate early
if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error(`❌ FATAL: Credentials file not found at ${CREDENTIALS_PATH}`)
  process.exit(1)
}
const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static(".")) // Serve static files (e.g., screenshots)

// --- Socket.io Setup ---
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins
    methods: ["GET", "POST"],
  },
})

// --- Sheet IDs for API Endpoints & Injector ---
const MAIN_SHEET_ID = process.env.MAIN_SHEET_ID
const ADA_PRO_ID = process.env.ADA_PRO_ID
const ADA_DUPLICATE_SHEET_ID = process.env.ADA_DUPLICATE_SHEET_ID
const BULK_INJECT_SHEET_ID = process.env.BULK_INJECT_SHEET_ID

// --- UserWay Account ID (for /api/scan and injector) ---
const USERWAY_ACCOUNT_ID = process.env.USERWAY_ACCOUNT_ID // This is the Pro ID, e.g., '062WMb6Yf6'

if (!USERWAY_ACCOUNT_ID) console.warn("⚠️ USERWAY_ACCOUNT_ID not found in .env")
if (!BULK_INJECT_SHEET_ID)
  console.warn("⚠️ BULK_INJECT_SHEET_ID not found in .env")

// --- UserWay Scripts ---
const ELEMENTOR_SCRIPT = `<script src="https://cdn.userway.org/widget.js" data-account="${USERWAY_ACCOUNT_ID}"></script>`
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

function rgbToHex(rgb) {
  if (!rgb || typeof rgb !== "string") return rgb
  // If it's already hex, return it
  if (rgb.startsWith("#")) return rgb
  // If it's 'transparent' or another named color
  if (!rgb.startsWith("rgb")) return rgb

  // Match rgb(r, g, b) or rgba(r, g, b, a)
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/)
  if (!match) return rgb // Could not parse

  // Convert each part to a 2-digit hex string
  const r = parseInt(match[1]).toString(16).padStart(2, "0")
  const g = parseInt(match[2]).toString(16).padStart(2, "0")
  const b = parseInt(match[3]).toString(16).padStart(2, "0")

  return `#${r}${g}${b}`.toUpperCase()
}

// --- Global state for running jobs ---
const stopFlags = {}
const interactiveSessions = {} // Stores { browser, sitesRemaining }

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id)

  // Helper to log to both server console and client UI via socket
  const logToClient = (message, level = "info") => {
    const logData = { message, level }
    console.log(`[${level}] ${message}`)
    // Emit to the specific user who started the job
    socket.emit("bulk-inject-log", logData)
  }

  // --- START: Job Cleanup ---
  const cleanupSession = async (sid) => {
    logToClient("Cleaning up session...")
    delete stopFlags[sid]
    const session = interactiveSessions[sid]
    if (session) {
      try {
        if (session.browser) {
          await session.browser.close()
        }
      } catch (e) {
        logToClient("Browser already closed.", "error")
      }
      delete interactiveSessions[sid]
    }
  }

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id)
    cleanupSession(socket.id) // Clean up on disconnect
  })

  socket.on("stop-bulk-inject", () => {
    logToClient("STOP signal received for bulk inject.")
    stopFlags[socket.id] = true
  })

  socket.on("stop-interactive-verify", async () => {
    logToClient("STOP signal received for interactive verify.")
    stopFlags[socket.id] = true
    await cleanupSession(socket.id)
    logToClient("Process stopped by user.")
  })
  // --- END: Job Cleanup ---

  socket.on("stop-color-scan", () => {
    logToClient("STOP signal received for color scan.")
    stopFlags[socket.id] = true
    logToClient("Process stopped by user.") // This triggers the UI reset
  })

  // --- START: BULK INJECT LOGIC ---
  socket.on("start-bulk-inject", async (options) => {
    stopFlags[socket.id] = false

    const config = {
      sheetId: BULK_INJECT_SHEET_ID,
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

    logToClient(
      `Bulk inject started. Concurrency: ${config.concurrency}, Headless: ${HEADLESS}`
    )

    if (!config.sheetId) {
      logToClient(
        "ERROR: sheetId is not set. Please update .env or send from client.",
        "error"
      )
      return
    }
    if (!fs.existsSync(config.credentials)) {
      logToClient(
        `ERROR: Credentials file not found at ${config.credentials}.`,
        "error"
      )
      return
    }

    try {
      const sites = await getSitesFromSheet(
        config.sheetId,
        config.range || "Sheet1!A1:E", // Default range
        config.credentials,
        logToClient
      )

      logToClient("Launching Puppeteer browser for bulk inject...")
      const browser = await puppeteer.launch({
        headless: HEADLESS,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })

      const results = []
      const queue = sites.slice()
      let index = 0

      logToClient(`Starting worker pool with ${config.concurrency} workers...`)
      const workers = new Array(config.concurrency).fill(null).map(async () => {
        while (queue.length) {
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
          const result = await processSite(
            browser,
            site,
            index,
            logToClient,
            socket.id
          )
          results.push(result)
          await sleep(1000)
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
        logToClient(
          `All done. Results saved to server as ${resultsFilename}`,
          "success"
        )
      }
    } catch (err) {
      console.error("Orchestrator error:", err.message)
      logToClient("FATAL ERROR: " + err.message, "error")
    }
  })
  // --- END: BULK INJECT LOGIC ---

  // --- START: NEW INTERACTIVE VERIFY LOGIC ---
  socket.on("start-interactive-verify", async (options) => {
    stopFlags[socket.id] = false
    logToClient("Starting Interactive Verify & Inject...")

    const config = {
      sheetId: BULK_INJECT_SHEET_ID,
      range: "Sheet1!A1:E", // Make sure this range includes URL and credentials
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

    try {
      const sites = await getSitesFromSheet(
        config.sheetId,
        config.range,
        config.credentials,
        logToClient
      )

      logToClient("Launching persistent Puppeteer browser for session...")
      const browser = await puppeteer.launch({
        headless: HEADLESS,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })

      interactiveSessions[socket.id] = { browser, sitesRemaining: sites }
      // Start the recursive-style processing loop (without parameters)
      await runInteractiveVerify(socket)
    } catch (err) {
      logToClient(`FATAL ERROR: ${err.message}`, "error")
      await cleanupSession(socket.id)
    }
  })

  socket.on("user-confirmed-install", async ({ site }) => {
    const session = interactiveSessions[socket.id]
    if (!session || stopFlags[socket.id]) {
      logToClient("Session expired or stopped. Aborting install.", "error")
      return
    }

    try {
      logToClient(`User confirmed. Injecting script into ${site.url}...`)
      // We pass the persistent browser from the session
      await processSite(
        session.browser,
        site,
        "Interactive",
        logToClient,
        socket.id
      )
      logToClient("Injection complete.", "success")
    } catch (e) {
      logToClient(`Injection failed: ${e.message}`, "error")
    }

    // Continue the loop with the remaining sites
    logToClient("Moving to next site...")
    await runInteractiveVerify(socket)
  })

  socket.on("user-skipped-verify", async () => {
    const session = interactiveSessions[socket.id]
    if (!session || stopFlags[socket.id]) {
      logToClient("Session expired or stopped.", "error")
      return
    }

    logToClient("User skipped. Moving to next site...")
    // Continue the loop with the remaining sites
    await runInteractiveVerify(socket)
  })

  // --- Interactive Verify Orchestrator ---
  const runInteractiveVerify = async (socket) => {
    const session = interactiveSessions[socket.id]
    if (stopFlags[socket.id]) {
      logToClient("Process stopped by user.")
      await cleanupSession(socket.id)
      return
    }

    if (!session) {
      logToClient("Session not found. Aborting.", "error")
      return
    }

    // Get the sites list from the session
    const sites = session.sitesRemaining
    const site = sites.shift() // Get next site (this mutates the session's array)

    if (!site) {
      logToClient("All sites processed!", "success")
      await cleanupSession(socket.id)
      return
    }

    if (!site.url || !site.username || !site.password) {
      logToClient(
        `Skipping row: Data is incomplete (URL, user, or pass is missing).`
      )
      // Automatically run next
      await runInteractiveVerify(socket)
      return
    }

    logToClient(`Scanning ${site.url}...`)
    const scanResult = await checkSiteSource(site.url, logToClient)

    switch (scanResult) {
      case "pro":
        logToClient(
          `Pro script found on ${site.url}. Updating sheets...`,
          "success"
        )
        try {
          await updateSheetsForVerifiedSite(site.url, logToClient)
        } catch (e) {
          logToClient(`Failed to update sheets: ${e.message}`, "error")
        }
        // Automatically run next
        await runInteractiveVerify(socket)
        break

      case "other":
        logToClient(
          `ERROR: Another UserWay script was found on ${site.url}.`,
          "error"
        )
        // Automatically run next
        await runInteractiveVerify(socket)
        break

      case "none":
        logToClient(`No UserWay script found on ${site.url}.`)
        // --- PAUSE and ask user ---
        socket.emit("prompt-for-install", { site })
        // The loop stops here and waits for user-confirmed-install or user-skipped-verify
        break

      case "error":
        logToClient(`ERROR: Failed to scan site ${site.url}.`, "error")
        // Automatically run next
        await runInteractiveVerify(socket)
        break

      default:
        logToClient(`Unknown scan result: ${scanResult}`, "error")
        await runInteractiveVerify(socket)
    }
  }

  // --- NEW: SOCKET LISTENER FOR SINGLE LOGIN TEST ---
  socket.on("start-single-login-test", async ({ url }) => {
    const log = (msg, level = "info") => logToClient(`[Test] ${msg}`, level)
    log(`Starting login test for: ${url}`)

    let browser
    try {
      // 1. Format URL
      const cleanBaseUrl = url
        .replace(/^https?:\/\//, "") // Remove protocol
        .replace(/\/+$/, "") // Remove trailing slash
      const base = `https://${cleanBaseUrl}`
      const loginPage = `${base}/ghost-login`
      const username = "support.loginuser@growth99.net"

      // 2. Get Password
      const password = await getPasswordForUrl(base, log)

      // 3. Launch Puppeteer
      log("Launching browser for test...")
      browser = await puppeteer.launch({
        headless: true, // Always headless for this quick test
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })
      const page = await browser.newPage()
      page.setDefaultNavigationTimeout(30000) // 30s timeout

      // 4. Navigate and Login
      log(`Navigating to ${loginPage}...`)
      await page.goto(loginPage, { waitUntil: "domcontentloaded" })

      // --- START: New Login Logic ---
      // 'username' is hardcoded "support.loginuser@growth99.net"
      // 'password' is from getPasswordForUrl
      let loginSuccess = await attemptLogin(page, log, username, password)

      if (!loginSuccess) {
        log(
          "Primary login failed. Retrying with onboarding.india@growth99.com..."
        )
        loginSuccess = await attemptLogin(
          page,
          log,
          "onboarding.india@growth99.com",
          password
        )
      }
      // --- END: New Login Logic ---

      // 5. Check for error and take screenshot
      const loginError = !loginSuccess // Check our new boolean
      const screenshotFile = `login-${
        loginError ? "error" : "success"
      }-${cleanBaseUrl.replace(/[^a-z0-9]/gi, "_")}.png`

      await page.screenshot({ path: screenshotFile, fullPage: true })

      if (loginError) {
        throw new Error("Login failed for both usernames. Check credentials.")
      }

      // 6. Report Success
      log("Login successful.", "success")
      socket.emit("login-test-result", {
        url: cleanBaseUrl,
        status: "success",
        message: "Login Successful",
        screenshot: screenshotFile,
      })
    } catch (err) {
      // 7. Report Error
      log(`Test Failed: ${err.message}`, "error")
      const screenshotFile = `login-error-${url
        .replace(/[^a-z0-9]/gi, "_")
        .slice(0, 50)}.png`

      // Try to take screenshot even on error
      try {
        if (browser) {
          const pages = await browser.pages()
          if (pages[1])
            await pages[1].screenshot({ path: screenshotFile, fullPage: true })
        }
      } catch (e) {}

      socket.emit("login-test-result", {
        url: url,
        status: "error",
        message: err.message,
        screenshot: screenshotFile,
      })
    } finally {
      // 8. Cleanup
      if (browser) {
        await browser.close()
        log("Browser closed.")
      }
    }
  })
  // --- END: NEW LISTENER ---

  socket.on("start-color-scan", async () => {
    stopFlags[socket.id] = false
    logToClient("Starting Color Scan...")

    const COLOR_SCAN_SHEET_ID = "1woWI26FBmGPz5HGmz6L5-40yts1wRkMaSc2Q18YnBps"
    const READ_RANGE = "Sheet1!D1:D" // Column D
    let browser

    try {
      // 1. Get Sheet Data
      logToClient(`Fetching URLs from ${COLOR_SCAN_SHEET_ID}...`)
      const sheets = await getSheetsApi()
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: COLOR_SCAN_SHEET_ID,
        range: READ_RANGE,
      })
      const rows = res.data.values || []
      const urlsToScan = rows
        .slice(1) // Skip header
        .map((row, index) => ({
          url: row[0],
          rowIndex: index + 2, // +1 for 1-based, +1 for sliced header
        }))
        .filter((item) => item.url && item.url.trim() !== "")

      logToClient(`Found ${urlsToScan.length} URLs to scan.`)
      if (urlsToScan.length === 0) {
        throw new Error("No URLs found in Column D.")
      }

      // 2. Launch Puppeteer
      logToClient("Launching browser for color scan...")
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })

      // 3. Loop and Scan
      const updates = []
      for (const { url, rowIndex } of urlsToScan) {
        if (stopFlags[socket.id]) {
          logToClient("Stopping scan...")
          break
        }

        logToClient(`[${rowIndex}] Scanning ${url}...`)
        const page = await browser.newPage()
        await page.setDefaultNavigationTimeout(20000)
        let color = "ERROR"

        try {
          const fullUrl = url.startsWith("http")
            ? url
            : `https://${url.replace(/\/+$/, "")}`
          await page.goto(fullUrl, { waitUntil: "networkidle2" })

          // --- START: POPUP CLOSE LOGIC (Request 2) ---
          try {
            logToClient(` -> Checking for popups...`)
            const closeButton = await page.$(
              'button[aria-label*="close" i], a[aria-label*="close" i]'
            )
            if (closeButton) {
              logToClient(` -> Found popup, attempting to close...`)
              await closeButton.click()
              await page.waitForTimeout(1000) // Wait for modal to disappear
            } else {
              logToClient(` -> No popup found.`)
            }
          } catch (e) {
            logToClient(
              ` -> (Warning) Popup check failed: ${e.message.slice(0, 50)}...`
            )
          }
          // --- END: POPUP CLOSE LOGIC ---

          // --- START: HEX CONVERT LOGIC (Request 1) ---
          const rgbColor = await page.evaluate(() => {
            const el = document.querySelector(".feature-button")
            if (!el) return "Not Found"
            const style = window.getComputedStyle(el)
            return style.backgroundColor // e.g., "rgb(255, 0, 0)"
          })

          color = rgbToHex(rgbColor) // Convert to Hex
          logToClient(` -> Found color: ${color} (from ${rgbColor})`, "success")
          // --- END: HEX CONVERT LOGIC ---
        } catch (e) {
          color = `ERROR: ${e.message.slice(0, 100)}...`
          logToClient(` -> ${color}`, "error")
        } finally {
          await page.close()
        }

        // Add update request for Column F
        updates.push({
          range: `Sheet1!F${rowIndex}`,
          values: [[color]],
        })
      } // end for loop

      // 4. Batch Update Sheet
      if (stopFlags[socket.id]) {
        logToClient("Process stopped by user.")
        return
      }

      if (updates.length > 0) {
        logToClient(
          `Scan finished. Writing ${updates.length} updates to Column F...`
        )
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: COLOR_SCAN_SHEET_ID,
          resource: {
            valueInputOption: "USER_ENTERED",
            data: updates,
          },
        })
        logToClient("All updates written to sheet.", "success")
      } else {
        logToClient("No updates to write.")
      }

      logToClient("Color scan complete.", "success") // Triggers UI reset
    } catch (err) {
      logToClient(`FATAL ERROR: ${err.message}`, "error")
    } finally {
      if (browser) await browser.close()
      if (stopFlags[socket.id]) logToClient("Process stopped by user.")
    }
  })
}) // --- END: io.on("connection") ---

// --- START: Google Sheets & Puppeteer Helpers ---

// Auth
const SHEETS_AUTH_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
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

async function attemptLogin(page, log, username, password) {
  try {
    log(`Attempting login with user: ${username}`)

    // Clear fields first
    await page.evaluate(() => {
      const userField = document.querySelector("#user_login")
      const passField = document.querySelector("#user_pass")
      if (userField) userField.value = ""
      if (passField) passField.value = ""
    })

    // Type credentials
    await page.type("#user_login", username)
    await page.type("#user_pass", password)

    // Click login
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click("#wp-submit"),
    ])

    // Check for dashboard URL
    const url = page.url()
    if (url.includes("/ghost-admin")) {
      log("Login successful, /ghost-admin/ detected.", "success")
      return true
    }

    // Check for login error message
    const errorMsg = await page.$("#login_error")
    if (errorMsg) {
      const errorText = await page.evaluate((el) => el.textContent, errorMsg)
      log(`Login failed: ${errorText.trim()}`)
      return false
    }

    log("Login failed: Unknown reason (no error, not at admin).")
    return false
  } catch (err) {
    log(`Error during login attempt: ${err.message}`, "error")
    return false
  }
}

// --- NEW: Helper to get a password for a single URL ---
async function getPasswordForUrl(url, log) {
  log(`Authenticating to get password for ${url}...`)
  try {
    const sheets = await getSheetsApi()
    const range = "Sheet1!A:C" // Per request: URL in A, Pass in C
    log(`Fetching passwords from ${BULK_INJECT_SHEET_ID}, range ${range}...`)
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: BULK_INJECT_SHEET_ID,
      range: range,
    })
    const rows = res.data.values
    if (!rows || rows.length === 0) {
      throw new Error("No data found in password sheet.")
    }

    // Find the URL (case-insensitive and trim)
    const cleanUrl = url.toLowerCase().trim()
    for (const row of rows) {
      const sheetUrl = (row[0] || "").toLowerCase().trim()
      if (sheetUrl === cleanUrl) {
        const password = row[2] // Column C
        if (password) {
          log("Password found.", "success")
          return password
        } else {
          throw new Error(`Password found for ${url}, but is empty.`)
        }
      }
    }

    throw new Error(`URL ${url} not found in password sheet (Column A).`)
  } catch (err) {
    log(err.message, "error")
    throw err // Re-throw to be caught by the caller
  }
}

// Read sites from sheet
async function getSitesFromSheet(sheetId, range, credsFile, log) {
  log("Authenticating with Google Sheets...")
  const auth = new google.auth.GoogleAuth({
    keyFile: credsFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })

  log(`Fetching sites from ${sheetId}, range ${range}`)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: range,
  })
  const rows = res.data.values
  if (!rows || rows.length < 2) {
    // Need at least 1 row + header
    throw new Error("No data found in sheet or only header row present")
  }

  log(`Found ${rows.length} total rows in range. Filtering...`)

  // Filter out rows where Column D (the URL, index 3) is empty
  const filteredRows = rows.filter((r) => r[3] && r[3].trim() !== "")

  log(`Found ${filteredRows.length} sites with data in Column D.`)

  return filteredRows.map((r) => ({
    // Range is A1:E. So r[0]=A, r[1]=B, r[2]=C, r[3]=D, r[4]=E
    username: "support.loginuser@growth99.net", // Hardcoded per original script
    url: r[3], // Column D (index 3)
    password: r[4], // Column E (index 4)
  }))
}

// Puppeteer sleep
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms + Math.floor(Math.random() * 500)))
}

// Puppeteer builder detection
async function detectBuilder(page, log) {
  log("Detecting builder...")
  await page.waitForSelector("body", { timeout: 10000 })
  const hasElementor = await page.$("#ghost-admin-bar-elementor_edit_page")
  if (hasElementor) {
    log("Elementor detected.")
    return "elementor"
  }

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

// Puppeteer install Elementor
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

  log("Verifying Elementor Pro 'Custom Code' page...")
  const isCorrectPage = await page.$("body.post-type-elementor_snippet")
  if (!isCorrectPage) {
    log(
      "Elementor Pro 'Custom Code' feature not found. This site may have the free version."
    )
    throw new Error("Elementor Pro 'Custom Code' feature not found.")
  }
  log("Elementor Pro page verified.")

  log('Entering title: "UserWay Accessibility"')
  await page.type("#title", "UserWay Accessibility")

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
    return false
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

  log('Clicking "Publish" (WordPress button)')
  await page.click("#publish")

  log("Waiting for Elementor 'Publish Settings' modal...")
  await page.waitForSelector(".eps-modal", {
    visible: true,
    timeout: 10000,
  })
  log("Publish modal appeared.")

  try {
    const selectSelector = ".e-site-editor-conditions__input-wrapper select"
    log("Waiting for condition <select> element...")
    await page.waitForSelector(selectSelector, { visible: true })

    log("Setting condition to 'Entire site' (general)...")
    await page.select(selectSelector, "general")
    await sleep(500)

    const saveButtonSelector = ".e-site-editor-conditions__footer .eps-button"
    log('Clicking "Save & Close"...')

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click(saveButtonSelector),
    ])
  } catch (e) {
    log(`ERROR setting condition: ${e.message}`)
    throw new Error("Failed to set condition or click 'Save & Close' in modal.")
  }

  await sleep(2000)
  log("Elementor script installed successfully.")
  return true
}

// Puppeteer install WPBakery
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
    return false
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
  return true
}

// --- Puppeteer Main Worker ---
async function processSite(browser, site, index, log, socketId) {
  const { url, username, password } = site
  const debugPrefix = `[${index}] ${url.replace(/^https?:\/\//, "")}`

  // This 'log' function is local to processSite
  const localLog = (...args) => {
    log(debugPrefix + " - " + args.join(" "))
  }

  const page = await browser.newPage()
  page.setDefaultNavigationTimeout(60000)

  try {
    if (stopFlags[socketId]) throw new Error("Process stopped by user")

    localLog("Starting")
    const base = url.startsWith("http")
      ? url.replace(/\/+$/, "")
      : `https://${url.replace(/\/+$/, "")}`

    localLog(`Navigating to ${base} for pre-check...`)
    await page.goto(base, { waitUntil: "domcontentloaded" })
    await sleep(500) // Allow for any client-side rendering

    const pageSource = await page.content()
    const proScript = `data-account="${USERWAY_ACCOUNT_ID}"`

    if (pageSource.includes(proScript)) {
      await addUrlToDuplicateSheet(url, log)

      localLog(
        "SKIPPING: Pro script already found on the site. No login required."
      )
      await page.close()
      return {
        url,
        status: "skipped",
        builder: "unknown",
        message: "Pro script already present.",
      }
    }
    localLog("Pre-check complete. Pro script not found. Proceeding to login.")

    const loginPage = `${base}/ghost-login`
    localLog(`Navigating to ${loginPage}`)
    await page.goto(loginPage, { waitUntil: "domcontentloaded" })
    await sleep(500)

    if (stopFlags[socketId]) throw new Error("Process stopped by user")

    let loginSuccess = await attemptLogin(page, localLog, username, password)

    if (!loginSuccess) {
      localLog(
        "Primary login failed. Retrying with onboarding.india@growth99.com..."
      )
      loginSuccess = await attemptLogin(
        page,
        localLog,
        "onboarding.india@growth99.com",
        password
      )
    }

    if (!loginSuccess) {
      throw new Error("Login failed for both usernames. Check credentials.")
    }

    if (stopFlags[socketId]) throw new Error("Process stopped by user")

    const builder = await detectBuilder(page, localLog)
    localLog("Detected builder:", builder)

    let installSuccess = false // <-- 1. DECLARE THE VARIABLE
    if (builder === "elementor")
      installSuccess = await installElementor(page, ELEMENTOR_SCRIPT, localLog)
    // <-- 2. CAPTURE THE RESULT
    else if (builder === "wpbakery")
      installSuccess = await installWPBakery(page, WP_BAKERY_SNIPPET, localLog)
    // <-- 2. CAPTURE THE RESULT
    else localLog("Builder unknown or not supported. Skipping.")

    if (installSuccess) {
      localLog("Script addition successful. Updating duplicate sheet...")
      await addUrlToDuplicateSheet(url, log)
    }

    await page.close()
    localLog("Completed")
    return { url, status: "ok", builder }
  } catch (err) {
    console.error(debugPrefix, "ERROR:", err.message)
    log(debugPrefix + " ERROR: " + err.message, "error")
    try {
      await page.screenshot({
        path: `error-${index}-${url.replace(/[^a-zA-Z0-9]/g, "_")}.png`,
        fullPage: true,
      })
    } catch (e) {
      // ignore screenshot error
    }
    await page.close()
    return { url, status: "error", error: err.message }
  }
}

// --- NEW: Helper to check site source ---
async function checkSiteSource(url, log) {
  const proScript = `data-account="${USERWAY_ACCOUNT_ID}"`

  try {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`
    const { data: pageSource } = await axios.get(fullUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      timeout: 15000,
    })

    if (pageSource.includes(proScript)) {
      return "pro"
    }
    if (pageSource.includes("userway.org/widget")) {
      return "other"
    }
    return "none"
  } catch (error) {
    log(`Failed to fetch ${url}: ${error.message}`, "error")
    return "error"
  }
}

// Replaces the flaky 'append' with an explicit 'batchUpdate'
async function addRowToProSheet(url, activatedDate, log) {
  if (!activatedDate) {
    // Fallback for the interactive verifier which doesn't pass a date
    activatedDate = new Date().toLocaleDateString()
  }

  log(`[addRowToProSheet] Adding ${url} to History Sheet...`)

  try {
    const sheets = await getSheetsApi()

    // 1. Check for duplicates
    const alreadyExists = await isUrlInSheet(
      url,
      ADA_PRO_ID,
      "Complete Master sheet!B:B", // Check Column B
      log
    )
    if (alreadyExists) {
      log(`[addRowToProSheet] SKIPPING: ${url} already exists.`)
      return
    }

    // 2. Find the next empty row by checking Column B
    // We get B1:B to include the header row in the count
    const getRange = "Complete Master sheet!B1:B"
    const getRes = await sheets.spreadsheets.values.get({
      spreadsheetId: ADA_PRO_ID,
      range: getRange,
    })

    // If sheet has header + 50 sites, length is 51. Next row is 52.
    const lastRow = getRes.data.values ? getRes.data.values.length : 0
    const newRow = lastRow + 1 // +1 to get the next empty row
    log(
      `[addRowToProSheet] Found last row at ${lastRow}, will write to new row ${newRow}.`
    )

    // 3. Prepare explicit cell update requests
    const requests = [
      {
        // URL in B
        range: `Complete Master sheet!B${newRow}`,
        values: [[url]],
      },
      {
        // Active in D
        range: `Complete Master sheet!D${newRow}`,
        values: [["Active"]],
      },
      {
        // Date in F
        range: `Complete Master sheet!F${newRow}`,
        values: [[activatedDate]],
      },
      {
        // Complete in J
        range: `Complete Master sheet!J${newRow}`,
        values: [["Complete"]],
      },
    ]

    // 4. Execute the batch update
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: ADA_PRO_ID,
      resource: {
        valueInputOption: "USER_ENTERED",
        data: requests,
      },
    })

    log(
      `[addRowToProSheet] Successfully added ${url} to row ${newRow}.`,
      "success"
    )
  } catch (err) {
    log(`[addRowToProSheet] FATAL ERROR adding row: ${err.message}`, "error")
    throw err // Re-throw to be caught by caller
  }
}

async function updateSheetsForVerifiedSite(url, log) {
  try {
    //  function handles duplicate checks and all sheet logic.
    // We pass null for activatedDate to use today's date as a fallback.
    await addRowToProSheet(url, null, log)
  } catch (e) {
    log(`ERROR in updateSheetsForVerifiedSite: ${e.message}`, "error")
    // Don't throw, just log. The main process shouldn't stop.
  }
  log("Sheets updated successfully.", "success")
}

// --- NEW: Helper to check if URL exists in a sheet ---
async function isUrlInSheet(url, sheetId, range, log) {
  log(`Checking for ${url} in ${sheetId}...`)
  try {
    const sheets = await getSheetsApi()
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range, // e.g., "Sheet1!B:B"
    })
    const values = res.data.values
    if (values) {
      // values is a 2D array, e.g., [["url1"], ["url2"]]
      const flatList = values.flat()
      return flatList.includes(url)
    }
    return false
  } catch (e) {
    log(`ERROR checking sheet: ${e.message}`, "error")
    return false // Fail safe, assume it doesn't exist
  }
}

// --- NEW: Helper to add URL to Duplicate sheet (for script addition) ---
async function addUrlToDuplicateSheet(url, log) {
  // Request 2: Check if it already exists
  const alreadyExists = await isUrlInSheet(
    url,
    ADA_DUPLICATE_SHEET_ID,
    "Sheet1!B:B", // Check only URL column
    log
  )

  if (alreadyExists) {
    log(
      `Skipping: ${url} already exists in ADA Duplicate Sheet Sheet (from addUrlToDuplicateSheet).`
    )
    return
  }

  // Request 1: Add to B column
  try {
    log(`Appending ${url} to ADA Duplicate Sheet Sheet (post-install)...`)
    const sheets = await getSheetsApi()
    await sheets.spreadsheets.values.append({
      spreadsheetId: ADA_DUPLICATE_SHEET_ID,
      range: "Sheet1!A:B", // Appends to first empty row
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [["", url]], // [Col A, Col B]
      },
    })
    log(`Successfully appended ${url} to ADA Duplicate Sheet Sheet.`, "success")
  } catch (e) {
    log(
      `ERROR appending to ADA Duplicate Sheet Sheet (post-install): ${e.message}`,
      "error"
    )
    // Don't throw, just log the error. The main install was successful.
  }
}

// --- END: Google Sheets & Puppeteer Helpers ---

// --- START: API Endpoints ---

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
    const data = await fetchSheetData(ADA_DUPLICATE_SHEET_ID, "Sheet1!A:Z")
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 2. Get history data from ADA Pro sheet
app.get("/api/history-data", async (req, res) => {
  try {
    const data = await fetchSheetData(ADA_PRO_ID, "Complete Master sheet!A:G")
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
      timeout: 10000,
    })
    const basicScript = 'data-account="y0juzG0O0x"'
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

// 4. Add entry to ADA Pro
app.post("/api/add-history", async (req, res) => {
  const { websiteUrl, activatedDate } = req.body
  try {
    // New helper handles duplicates and explicit cell writes
    await addRowToProSheet(
      websiteUrl,
      activatedDate,
      console.log // Use console.log for server API logging
    )
    res.json({ success: true })
  } catch (error) {
    console.error("Error in /api/add-history:", error.message)
    res.status(500).json({ error: "Failed to update ADA Pro" })
  }
})

// --- Debounce logic for notifications ---
const notificationTimers = {}
const DEBOUNCE_TIME = 5000
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
        // 'Cookie': 'PASTE_YOUR_BASECAMP_COOKIE_STRING_HERE'
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
// --- END: API Endpoints ---

// --- Start Server ---
const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`)
})
