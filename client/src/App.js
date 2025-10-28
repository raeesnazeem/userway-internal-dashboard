import React, { useState, useEffect, useRef } from "react"
import axios from "axios"
import { io } from "socket.io-client"
import NotificationBell from "./components/Notification"
import LoginTester from "./components/LoginTester"
import TabNavigator from "./components/TabNavigator"
import MasterTab from "./components/MasterTab"
import HistoryTab from "./components/HistoryTab"
import InstallerTab from "./components/InstallerTab"
import "./App.css"

// --- Configuration ---
const API_BASE_URL = "http://localhost:3001"
const SOCKET_URL = "http://localhost:3001"

// --- Mappings ---
// Note: These constants are now passed as props to the components that need them
const EXISTING_COL_DATE = 1 // Column B
const EXISTING_COL_PROJECT = 3 // Column D
const NEW_COL_DATE = 0 // Column A
const NEW_COL_PROJECT = 3 // Column D
const URL_COL_PROJECT = 0 // Column A
const URL_COL_URL = 1 // Column B
const URL_COL_DEACTIVATION_DATE = 5 // Column F
const HISTORY_COL_URL = 1 // Column B
const HISTORY_COL_CANCELLED_STATUS = 6 // Column G

// --- Main App Component ---
function App() {
  const [activeTab, setActiveTab] = useState("master")
  const [masterData, setMasterData] = useState([])
  const [historyData, setHistoryData] = useState([])
  const [scanStatus, setScanStatus] = useState({})

  // --- State for filters ---
  const [searchTerm, setSearchTerm] = useState("")
  const [activeCategory, setActiveCategory] = useState("All")
  const [historySearchTerm, setHistorySearchTerm] = useState("")
  const [historySortOrder, setHistorySortOrder] = useState("asc")

  // --- App-wide state ---
  const [isScanningAll, setIsScanningAll] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [socket, setSocket] = useState(null)

  // --- State for Installer & Login Tester ---
  const [bulkInjectLogs, setBulkInjectLogs] = useState([])
  const [isInjecting, setIsInjecting] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [loginTestResults, setLoginTestResults] = useState([])

  // --- Data Fetching ---
  const fetchMasterData = async () => {
    console.log("Fetching all master data...")
    try {
      const [existingRes, newRes, urlRes, historyRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/existing-data`),
        axios.get(`${API_BASE_URL}/api/new-data`),
        axios.get(`${API_BASE_URL}/api/url-data`),
        axios.get(`${API_BASE_URL}/api/history-data`),
      ])

      // 1. Create Lookup Maps from URL & History sheets
      const urlMap = new Map()
      const deactivationMap = new Map()
      const urlData = urlRes.data.slice(1) // skip header
      for (const row of urlData) {
        const projectName = row[URL_COL_PROJECT]
        const url = row[URL_COL_URL]
        const deactivationDate = row[URL_COL_DEACTIVATION_DATE]
        if (projectName) {
          const normalizedName = projectName.toLowerCase().trim()
          if (url) urlMap.set(normalizedName, url)
          if (deactivationDate)
            deactivationMap.set(normalizedName, deactivationDate)
        }
      }

      const cancellationMap = new Map()
      const historyDataRaw = historyRes.data.slice(1) // skip header
      for (const row of historyDataRaw) {
        const url = row[HISTORY_COL_URL]
        const cancelledStatus = row[HISTORY_COL_CANCELLED_STATUS]
        if (
          url &&
          cancelledStatus &&
          cancelledStatus.toLowerCase().includes("cancelled client")
        ) {
          cancellationMap.set(url.toLowerCase().trim(), true)
        }
      }

      // 2. Process "Existing" customers
      const processedExisting = existingRes.data.slice(1).map((row, index) => {
        const projectName = row[EXISTING_COL_PROJECT] || ""
        const normalizedName = projectName.toLowerCase().trim()
        const projectUrl = urlMap.get(normalizedName) || null
        const isCancelledMaster = (row[EXISTING_COL_DATE] || "")
          .toLowerCase()
          .includes("cancelled")
        return {
          id: `existing-${index}`,
          date: row[EXISTING_COL_DATE],
          projectName: projectName,
          url: projectUrl,
          deactivationDate: deactivationMap.get(normalizedName) || null,
          isCancelledPro: projectUrl
            ? cancellationMap.get(projectUrl.toLowerCase().trim()) || false
            : false,
          isCancelledMaster: isCancelledMaster,
        }
      })

      // 3. Process "New" customers
      const processedNew = newRes.data.slice(1).map((row, index) => {
        const projectName = row[NEW_COL_PROJECT] || ""
        const normalizedName = projectName.toLowerCase().trim()
        const projectUrl = urlMap.get(normalizedName) || null
        const isCancelledMaster = (row[NEW_COL_DATE] || "")
          .toLowerCase()
          .includes("cancelled")
        return {
          id: `new-${index}`,
          date: row[NEW_COL_DATE],
          projectName: projectName,
          url: projectUrl,
          deactivationDate: deactivationMap.get(normalizedName) || null,
          isCancelledPro: projectUrl
            ? cancellationMap.get(projectUrl.toLowerCase().trim()) || false
            : false,
          isCancelledMaster: isCancelledMaster,
        }
      })

      // 4. Set final combined state
      setMasterData([...processedExisting, ...processedNew])
      console.log("Master data processed!")
    } catch (error) {
      console.error("Error fetching master data:", error)
    }
  }

  const fetchHistoryData = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/history-data`)
      const rawData = res.data.slice(1) || []
      const uniqueEntries = new Map()
      // De-duplicate: Only keep one entry per URL, preferring one with a date
      for (const row of rawData) {
        const url = row[1] // URL
        const date = row[5] // Date
        if (!url) continue
        const existingRow = uniqueEntries.get(url)
        if (!existingRow || (!existingRow[5] && date)) {
          uniqueEntries.set(url, row)
        }
      }
      setHistoryData(Array.from(uniqueEntries.values()))
    } catch (error) {
      console.error("Error fetching history data:", error)
      setHistoryData([])
    }
  }

  // --- Socket.io and Data Fetching Effects ---
  useEffect(() => {
    // Initial data fetch
    fetchMasterData()
    fetchHistoryData()

    // Setup socket
    const newSocket = io(SOCKET_URL)
    setSocket(newSocket)
    newSocket.on("connect", () => console.log("Socket.io connected"))

    // --- Socket Listeners ---
    newSocket.on("sheet-change", (data) => {
      console.log("Sheet change received:", data)
      const newNotification = { ...data, id: Date.now() }
      setNotifications((prev) => [newNotification, ...prev])
      setUnreadCount((prevCount) => prevCount + 1)
      // Re-fetch data on any change
      fetchMasterData()
      fetchHistoryData()
    })

    newSocket.on("bulk-inject-log", (logData) => {
      const newLog =
        typeof logData === "string"
          ? { message: logData, level: "info" }
          : logData
      setBulkInjectLogs((prevLogs) => [newLog, ...prevLogs.slice(0, 200)])

      if (
        newLog.message.includes("All done") ||
        newLog.message.includes("FATAL ERROR") ||
        newLog.message.includes("Process stopped by user") ||
        newLog.message.includes("All sites processed")
      ) {
        setIsInjecting(false)
        setIsVerifying(false)
      }
    })

    newSocket.on("prompt-for-install", ({ site }) => {
      const userConfirmed = window.confirm(
        `No UserWay ID found on ${site.url}.\n\nDo you want to log in and inject the Pro script now?`
      )
      if (userConfirmed) {
        setBulkInjectLogs((prev) => [
          {
            message: `User approved install for ${site.url}. Starting injection...`,
            level: "info",
          },
          ...prev,
        ])
        newSocket.emit("user-confirmed-install", { site })
      } else {
        setBulkInjectLogs((prev) => [
          {
            message: `User skipped install for ${site.url}. Moving to next...`,
            level: "info",
          },
          ...prev,
        ])
        newSocket.emit("user-skipped-verify")
      }
    })

    newSocket.on("login-test-result", (result) => {
      setLoginTestResults((prevResults) => [result, ...prevResults])
      setBulkInjectLogs((prev) => [
        {
          message: `TEST RESULT: ${result.url} - ${result.message}`,
          level: result.status === "success" ? "success" : "error",
        },
        ...prev,
      ])
    })

    return () => newSocket.close()
  }, [])

  // --- Notification ---
  const handleBellClick = () => {
    setUnreadCount(0)
  }

  // --- Scanning Functions (Passed to MasterTab) ---
  const handleScan = async (url, rowId) => {
    if (!url) {
      console.warn(`No URL for row ${rowId}, skipping scan.`)
      setScanStatus((prev) => ({
        ...prev,
        [rowId]: { isLoading: false, isPresent: false, status: "No URL" },
      }))
      return
    }
    const fullUrl = url.startsWith("http") ? url : `https://${url}`
    setScanStatus((prev) => ({
      ...prev,
      [rowId]: { isLoading: true, isPresent: false, status: "Scanning..." },
    }))
    try {
      const res = await axios.post(`${API_BASE_URL}/api/scan`, {
        url: fullUrl,
      })
      const { isPresent, status } = res.data
      setScanStatus((prev) => ({
        ...prev,
        [rowId]: { isLoading: false, isPresent, status },
      }))
      if (isPresent && status === "Pro") {
        await checkAndUpdateHistory(url)
      }
    } catch (error) {
      console.error("Scan failed:", error)
      setScanStatus((prev) => ({
        ...prev,
        [rowId]: {
          isLoading: false,
          isPresent: false,
          status: "Scan Failed",
        },
      }))
    }
  }

  const handleScanAll = async () => {
    setIsScanningAll(true)
    const rowsToScan = []
    for (const project of masterData) {
      const currentStatus = scanStatus[project.id]
      if (
        project.url &&
        (!currentStatus || !currentStatus.isPresent) &&
        !project.deactivationDate &&
        !project.isCancelledPro &&
        !project.isCancelledMaster
      ) {
        rowsToScan.push(project)
      }
      if (rowsToScan.length >= 100) break // Limit to 100
    }
    for (const project of rowsToScan) {
      await handleScan(project.url, project.id)
    }
    setIsScanningAll(false)
  }

  const checkAndUpdateHistory = async (websiteUrl) => {
    const alreadyExists = historyData.some((row) => row[1] === websiteUrl)
    if (!alreadyExists) {
      console.log(`Adding ${websiteUrl} to history...`)
      try {
        const activatedDate = new Date().toLocaleDateString()
        await axios.post(`${API_BASE_URL}/api/add-history`, {
          websiteUrl,
          activatedDate,
        })
        fetchHistoryData() // Refresh history data
      } catch (error) {
        console.error("Failed to add to history sheet:", error)
      }
    } else {
      console.log(`${websiteUrl} is already in history.`)
    }
  }

  // --- Render ---
  return (
    <div className="App">
      <NotificationBell
        notifications={notifications}
        unreadCount={unreadCount}
        onBellClick={handleBellClick}
      />
      <h1>ADA Plugin Dashboard</h1>

      <TabNavigator activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="tab-content">
        {activeTab === "master" && (
          <MasterTab
            masterData={masterData}
            scanStatus={scanStatus}
            handleScan={handleScan}
            handleScanAll={handleScanAll}
            isScanningAll={isScanningAll}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
          />
        )}
        {activeTab === "history" && (
          <HistoryTab
            historyData={historyData}
            historySearchTerm={historySearchTerm}
            setHistorySearchTerm={setHistorySearchTerm}
            historySortOrder={historySortOrder}
            setHistorySortOrder={setHistorySortOrder}
          />
        )}
        {activeTab === "installer" && (
          <InstallerTab
            socket={socket}
            isInjecting={isInjecting}
            isVerifying={isVerifying}
            setIsInjecting={setIsInjecting}
            setIsVerifying={setIsVerifying}
            bulkInjectLogs={bulkInjectLogs}
          />
        )}
        {activeTab === "login-tester" && (
          <LoginTester
            socket={socket}
            results={loginTestResults}
            logs={bulkInjectLogs}
          />
        )}
      </main>
    </div>
  )
}

export default App
