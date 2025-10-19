import React, { useState, useEffect } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import DataTable, { ScanCell } from "./components/DataTable";
import Notification from "./components/Notification";
import "./App.css";

// --- Configuration ---
const API_BASE_URL = "http://localhost:3001"; // Your backend URL
const SOCKET_URL = "http://localhost:3001";

// Column indices from your Google Sheet (0-based)
// **ADJUST THESE TO MATCH SHEET**
const COL_DATE = 1; // COL B
const COL_PROJECT_NAME = 3; // COL D
const COL_URL = 2; // COL C
// Add other columns if you need them

// --- Main App Component ---
function App() {
  const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard' or 'history'

  // Data state
  const [mainData, setMainData] = useState([]);
  const [historyData, setHistoryData] = useState([]);

  // State for scan statuses. { rowIndex: 'idle' | 'loading' | 'active' | 'error' }
  const [scanStatus, setScanStatus] = useState({});
  const [isScanningAll, setIsScanningAll] = useState(false);

  // --- 2. UPDATE NOTIFICATION STATE ---
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0); // New state for the badge
  const [socket, setSocket] = useState(null);

  // --- Effects ---

  // Connect to WebSocket server for real-time notifications
  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Socket.io connected");
    });

    // Listen for the 'sheet-change' event from the server
    newSocket.on("sheet-change", (data) => {
      console.log("Sheet change received:", data);

      // Add a unique ID to the notification
      const newNotification = { ...data, id: Date.now() };

      // --- 3. UPDATE NOTIFICATION LOGIC ---
      // Add to the top of the persistent list
      setNotifications((prev) => [newNotification, ...prev]);
      // Increment the unread counter
      setUnreadCount((prevCount) => prevCount + 1);

      // Refresh the main data table to show the change
      fetchMainData();
    });

    return () => newSocket.close();
  }, []);

  // Fetch data on initial load
  useEffect(() => {
    fetchMainData();
    fetchHistoryData();
  }, []);

  // --- Data Fetching Functions ---
  const fetchMainData = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/main-data`);
      // Skip header row (index 0)
      setMainData(res.data.slice(1) || []);
    } catch (error) {
      console.error("Error fetching main data:", error);
    }
  };

  const fetchHistoryData = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/history-data`);
      // Skip header row (index 0)
      setHistoryData(res.data.slice(1) || []);
    } catch (error) {
      console.error("Error fetching history data:", error);
    }
  };

  // --- 4. ADD FUNCTION TO RESET COUNT ---
  const handleBellClick = () => {
    // Called by the bell component when it's clicked
    setUnreadCount(0);
  };

  // --- Scanning Functions ---

  /**
   * Scans a single website URL.
   * @param {string} url - The website URL to scan.
   * @param {number} rowIndex - The index of the row in the mainData array.
   */
  const handleScan = async (url, rowIndex) => {
    // 1. Set status to 'loading'
    setScanStatus((prev) => ({ ...prev, [rowIndex]: "loading" }));

    try {
      // 2. Call backend scan API
      const res = await axios.post(`${API_BASE_URL}/api/scan`, { url });

      if (res.data.isPresent) {
        // 3a. If present, set status to 'active'
        setScanStatus((prev) => ({ ...prev, [rowIndex]: "active" }));

        // 4. Automatically check and update the history sheet
        await checkAndUpdateHistory(url);
      } else {
        // 3b. If not present, set status to 'error'
        setScanStatus((prev) => ({ ...prev, [rowIndex]: "error" }));
      }
    } catch (error) {
      console.error("Scan failed:", error);
      setScanStatus((prev) => ({ ...prev, [rowIndex]: "error" }));
    }
  };

  /**
   * Scans the top 100 entries that haven't been successfully scanned.
   */
  const handleScanAll = async () => {
    setIsScanningAll(true);

    // Find up to 100 rows that are not 'active'
    const rowsToScan = [];
    for (let i = 0; i < mainData.length; i++) {
      if (scanStatus[i] !== "active") {
        rowsToScan.push({ url: mainData[i][COL_URL], index: i });
      }
      if (rowsToScan.length >= 100) break;
    }

    // Scan them sequentially
    for (const row of rowsToScan) {
      // Check if URL is valid before scanning
      if (
        row.url &&
        (row.url.startsWith("http://") || row.url.startsWith("https{COL_URL}"))
      ) {
        await handleScan(row.url, row.index);
      } else {
        // Mark as error if URL is invalid
        setScanStatus((prev) => ({ ...prev, [row.index]: "error" }));
      }
    }

    setIsScanningAll(false);
  };

  /**
   * Checks history sheet and adds the URL if it's not already there.
   * @param {string} websiteUrl - The URL that was successfully scanned.
   */
  const checkAndUpdateHistory = async (websiteUrl) => {
    // 1. Check if URL is already in historyData
    // We check the 'Website URL' column (index 1) in historyData
    const alreadyExists = historyData.some((row) => row[1] === websiteUrl);

    if (!alreadyExists) {
      console.log(`Adding ${websiteUrl} to history...`);
      try {
        // 2. If not, add it
        const activatedDate = new Date().toLocaleDateString(); // e.g., "10/18/2025"
        await axios.post(`${API_BASE_URL}/api/add-history`, {
          websiteUrl,
          activatedDate,
        });

        // 3. Refresh history data to reflect the change
        fetchHistoryData();
      } catch (error) {
        console.error("Failed to add to history sheet:", error);
      }
    } else {
      console.log(`${websiteUrl} is already in history.`);
    }
  };

  // --- Render Functions ---

  const renderDashboardTab = () => (
    <>
      <div className="dashboard-header">
        <h2>Projects Pending Activation</h2>
        <button
          className="scan-all-button"
          onClick={handleScanAll}
          disabled={isScanningAll}
        >
          {isScanningAll ? "Scanning..." : "Scan All (Max 100)"}
        </button>
      </div>
      <DataTable
        headers={[
          "Date to Activate",
          "Project Name",
          "Website URL",
          "Scan Status",
        ]}
        rows={mainData}
        renderRow={(row, index) => {
          const url = row[COL_URL];
          return (
            <tr key={index}>
              <td>{row[COL_DATE]}</td>
              <td>{row[COL_PROJECT_NAME]}</td>
              <td>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {url}
                </a>
              </td>
              <td>
                <ScanCell
                  scanStatus={scanStatus[index] || "idle"}
                  onScan={() => handleScan(url, index)}
                />
              </td>
            </tr>
          );
        }}
      />
    </>
  );

  const renderHistoryTab = () => (
    <>
      <div className="dashboard-header">
        <h2>Usage & History (Activated Projects)</h2>
      </div>
      <DataTable
        headers={["Date Activated", "Website URL"]}
        rows={historyData}
        renderRow={(row, index) => (
          <tr key={index}>
            <td>{row[5]}</td> {/* Column F (Date Activated) */}
            <td>{row[1]}</td> {/* Column B (Website URL) */}
          </tr>
        )}
      />
    </>
  );

  return (
    <div className="App">
      {/* --- 5. REPLACE OLD COMPONENT WITH NEW ONE --- */}
      <Notification
        notifications={notifications}
        unreadCount={unreadCount}
        onBellClick={handleBellClick}
      />

      <h1>Client ADA Plugin Dashboard</h1>

      <nav className="tab-nav">
        <button
          className={`tab-button ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          Dashboard
        </button>
        <button
          className={`tab-button ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          Usage & History
        </button>
      </nav>

      <main className="tab-content">
        {activeTab === "dashboard" ? renderDashboardTab() : renderHistoryTab()}
      </main>
    </div>
  );
}

export default App;
